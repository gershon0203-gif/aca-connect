// =============================================================================
// ACA Connect — Edge Function: `send-push-notification`
// =============================================================================
// Secure server-side sender for Firebase Cloud Messaging (FCM) push
// notifications. Running with the service-role key, it:
//
//   1. Verifies the caller's JWT.
//   2. Authorizes by type: attendance/prayer reminders require an active
//      super_admin; chat pushes are allowed for the sender of the message.
//   3. Validates notification type (attendance_reminder | prayer_reminder |
//      chat_message) and re-reads all content from the database.
//   4. Validates recipient eligibility against attendance/prayer/chat records.
//   5. Retrieves eligible FCM device tokens from device_tokens.
//   6. Creates/refreshes the in-app notification for reminder recipients.
//   7. Sends notifications via Firebase Cloud Messaging HTTP v1 API.
//   8. Records delivery attempts (success/failure) in push_send_logs.
//   9. Marks invalid/expired tokens inactive.
//
// Retry semantics: a device that already received a successful push for the
// same in-app notification is skipped, so pressing Send again only retries the
// recipients/devices that failed. In-app notifications are de-duplicated by the
// (user_id, type, reference_id) unique index.
//
// The client never supplies FCM credentials or a role: the function re-reads
// the caller's role from user_roles and all Firebase credentials live in
// Edge Function secrets only.
//
// Deploy:
//   supabase functions deploy send-push-notification
//
// Required secrets (Dashboard → Edge Functions → Secrets, or `supabase secrets set`):
//   FIREBASE_PROJECT_ID       e.g. aca-connect-b254d
//   FIREBASE_CLIENT_EMAIL     Firebase service account client email
//   FIREBASE_PRIVATE_KEY      Firebase service account private key (PEM format)
//   APP_URL                   public web app origin (CORS allow-list)
//   SUPABASE_URL              (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY (auto-injected)
// =============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = (Deno.env.get('APP_URL') ?? 'https://aca-connect.vercel.app').replace(/\/+$/, '')

// The web app, local dev and the Capacitor Android shell. Requests from other
// origins are answered with the canonical app origin so browsers block them.
const ALLOWED_ORIGINS = new Set([
  APP_URL,
  'https://aca-connect.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
])

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  return {
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : APP_URL,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

type NotificationType = 'attendance_reminder' | 'prayer_reminder' | 'chat_message'

type SendPayload = {
  notification_type?: NotificationType
  session_id?: string
  prayer_item_id?: string
  message_id?: string
  title?: string
  message?: string
  member_ids?: string[]
}

type Recipient = {
  memberId: string
  userId: string
}

type DeviceRow = {
  id: string
  member_id: string
  token: string
  platform: string
}

interface PushLogRow {
  recipient_user: string
  notification_id: string | null
  reference_id: string | null
  type: NotificationType
  status: 'sent' | 'failed' | 'invalid_token'
  device_token: string | null
  error_message: string | null
}

type SendResult = {
  token: string
  status: 'sent' | 'failed' | 'invalid_token' | 'already_sent'
  error?: string
}

/** Never echo a full FCM token back to the client or into reports. */
function maskToken(token: string): string {
  if (token.length <= 8) return '****'
  return `****${token.slice(-6)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!jwt) return json(req, { error: 'Missing authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  if (!supabaseUrl || !serviceKey) {
    return json(req, { error: 'Supabase server credentials not configured' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ------------------------------------------------------------------
  // 1. Authenticate the caller
  // ------------------------------------------------------------------
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return json(req, { error: 'Invalid or expired session' }, 401)
  }

  const callerId = userData.user.id

  // Firebase config is checked only after authorization so unauthenticated
  // callers cannot probe the deployment.
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID')
  const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL')
  const privateKey = Deno.env.get('FIREBASE_PRIVATE_KEY')

  const missingSecrets = [
    !projectId && 'FIREBASE_PROJECT_ID',
    !clientEmail && 'FIREBASE_CLIENT_EMAIL',
    !privateKey && 'FIREBASE_PRIVATE_KEY',
  ].filter(Boolean)
  if (missingSecrets.length > 0) {
    return json(
      req,
      { error: `Firebase credentials not configured on server: ${missingSecrets.join(', ')}` },
      500,
    )
  }

  // ------------------------------------------------------------------
  // 2. Parse and validate payload
  // ------------------------------------------------------------------
  let body: SendPayload
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400)
  }

  const {
    notification_type,
    session_id,
    prayer_item_id,
    message_id,
    title,
    message,
    member_ids,
  } = body

  if (
    !notification_type ||
    !['attendance_reminder', 'prayer_reminder', 'chat_message'].includes(
      notification_type,
    )
  ) {
    return json(
      req,
      {
        error:
          'notification_type must be attendance_reminder, prayer_reminder or chat_message',
      },
      400,
    )
  }

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  const notificationRefId =
    notification_type === 'attendance_reminder'
      ? session_id
      : notification_type === 'prayer_reminder'
        ? prayer_item_id
        : message_id

  if (!notificationRefId) {
    return json(
      req,
      {
        error:
          notification_type === 'attendance_reminder'
            ? 'session_id is required for attendance_reminder'
            : notification_type === 'prayer_reminder'
              ? 'prayer_item_id is required for prayer_reminder'
              : 'message_id is required for chat_message',
      },
      400,
    )
  }

  if (!UUID_RE.test(notificationRefId)) {
    return json(
      req,
      {
        error:
          notification_type === 'attendance_reminder'
            ? 'session_id must be a valid UUID'
            : notification_type === 'prayer_reminder'
              ? 'prayer_item_id must be a valid UUID'
              : 'message_id must be a valid UUID',
      },
      400,
    )
  }

  // ------------------------------------------------------------------
  // 3. Authorize by notification type
  // ------------------------------------------------------------------
  // Reminders may only be sent by an active super_admin. Chat pushes may only
  // be sent by the sender of the referenced message; the Edge Function re-reads
  // the message and the caller's role from the database, so the client cannot
  // spoof authorization.
  if (notification_type !== 'chat_message') {
    const { data: roleRow, error: roleErr } = await admin
      .from('user_roles')
      .select('role, status')
      .eq('user_id', callerId)
      .maybeSingle()

    if (roleErr) return json(req, { error: roleErr.message }, 500)
    if (
      !roleRow ||
      roleRow.status !== 'active' ||
      roleRow.role !== 'super_admin'
    ) {
      return json(
        req,
        { error: 'Only a super_admin may send push notifications' },
        403,
      )
    }
  }

  // ------------------------------------------------------------------
  // 4. Validate reminder-specific fields
  // ------------------------------------------------------------------
  let cleanTitle: string
  let cleanMessage: string

  if (notification_type !== 'chat_message') {
    if (typeof title !== 'string' || title.trim().length === 0) {
      return json(req, { error: 'A reminder title is required' }, 400)
    }
    if (typeof message !== 'string' || message.trim().length === 0) {
      return json(req, { error: 'A reminder message is required' }, 400)
    }

    cleanTitle = title.trim()
    cleanMessage = message.trim()

    if (cleanTitle.length > 120) {
      return json(req, { error: 'Reminder title must be 120 characters or fewer' }, 400)
    }
    if (cleanMessage.length > 1000) {
      return json(req, { error: 'Reminder message must be 1000 characters or fewer' }, 400)
    }
  }

  if (member_ids !== undefined) {
    if (notification_type === 'chat_message') {
      return json(req, { error: 'member_ids is not valid for chat_message' }, 400)
    }
    if (!Array.isArray(member_ids)) {
      return json(req, { error: 'member_ids must be an array of UUIDs' }, 400)
    }
    if (member_ids.length > 5000) {
      return json(req, { error: 'member_ids contains too many entries' }, 400)
    }
    if (member_ids.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
      return json(req, { error: 'member_ids must contain only valid UUIDs' }, 400)
    }
  }

  // ------------------------------------------------------------------
  // 3. Validate recipients and collect eligible member/user pairs
  // ------------------------------------------------------------------
  let recipientCandidates: Array<{ id: string; user_id: string | null }> = []

  if (notification_type === 'attendance_reminder') {
    const { data: session, error: sessionErr } = await admin
      .from('attendance_sessions')
      .select('id, status')
      .eq('id', session_id)
      .maybeSingle()

    if (sessionErr) return json(req, { error: sessionErr.message }, 500)
    if (!session) return json(req, { error: 'Attendance session not found' }, 404)
    if (session.status !== 'completed') {
      return json(req, { error: 'Complete the attendance session before sending reminders' }, 400)
    }

    const { data: records, error: recordsErr } = await admin
      .from('attendance_records')
      .select('member_id, status')
      .eq('session_id', session_id)
      .eq('status', 'absent')
    if (recordsErr) return json(req, { error: recordsErr.message }, 500)

    const absentMemberIds = new Set((records ?? []).map((r) => String(r.member_id)))

    // A caller may narrow the list, but may never widen it: only members that
    // are actually absent in this session can ever be selected.
    const requestedIds = Array.isArray(member_ids)
      ? member_ids.map(String).filter((id) => absentMemberIds.has(id))
      : [...absentMemberIds]

    if (requestedIds.length === 0) {
      return json(
        req,
        {
          error:
            member_ids && member_ids.length > 0
              ? 'None of the selected members are marked absent in this session'
              : 'This session has no members marked absent',
        },
        400,
      )
    }

    const { data: members, error: membersErr } = await admin
      .from('members')
      .select('id, user_id')
      .in('id', requestedIds)
      .eq('status', 'active')
      .not('user_id', 'is', null)
    if (membersErr) return json(req, { error: membersErr.message }, 500)

    recipientCandidates = members ?? []
  } else if (notification_type === 'prayer_reminder') {
    // prayer_reminder — verify the prayer item exists and is active
    const { data: item, error: itemErr } = await admin
      .from('prayer_items')
      .select('id, status')
      .eq('id', prayer_item_id)
      .maybeSingle()

    if (itemErr) return json(req, { error: itemErr.message }, 500)
    if (!item) return json(req, { error: 'Prayer item not found' }, 404)
    if (item.status !== 'active') {
      return json(req, { error: 'Select an active prayer before sending a reminder' }, 400)
    }

    const { data: members, error: membersErr } = await admin
      .from('members')
      .select('id, user_id')
      .eq('status', 'active')
      .not('user_id', 'is', null)
    if (membersErr) return json(req, { error: membersErr.message }, 500)

    recipientCandidates = members ?? []
  } else {
    // chat_message — verify the message exists and the caller is its sender,
    // then resolve recipients (private: the other party; group: every active
    // linked member except the sender).
    const { data: messageRow, error: messageErr } = await admin
      .from('chat_messages')
      .select('id, channel, sender_id, recipient_id, body')
      .eq('id', message_id)
      .maybeSingle()

    if (messageErr) return json(req, { error: messageErr.message }, 500)
    if (!messageRow) return json(req, { error: 'Chat message not found' }, 404)
    if (String(messageRow.sender_id) !== callerId) {
      return json(
        req,
        { error: 'Only the sender of a message may notify its recipients' },
        403,
      )
    }

    const recipientUserIds: string[] = []
    if (messageRow.channel === 'private') {
      if (messageRow.recipient_id && String(messageRow.recipient_id) !== callerId) {
        recipientUserIds.push(String(messageRow.recipient_id))
      }
    } else {
      // Group chat: notify every active, linked member except the sender.
      const { data: groupMembers, error: groupMembersErr } = await admin
        .from('members')
        .select('user_id')
        .eq('status', 'active')
        .not('user_id', 'is', null)
      if (groupMembersErr) return json(req, { error: groupMembersErr.message }, 500)
      for (const m of groupMembers ?? []) {
        if (m.user_id && String(m.user_id) !== callerId) {
          recipientUserIds.push(String(m.user_id))
        }
      }
    }

    if (recipientUserIds.length === 0) {
      return json(
        req,
        {
          sent: 0,
          failed: 0,
          already_sent: 0,
          invalid_tokens: 0,
          recipients: 0,
          total_devices: 0,
          skipped: 'no eligible recipients',
        },
        200,
      )
    }

    const { data: chatMembers, error: chatMembersErr } = await admin
      .from('members')
      .select('id, user_id')
      .in('user_id', recipientUserIds)
      .eq('status', 'active')
      .not('user_id', 'is', null)
    if (chatMembersErr) return json(req, { error: chatMembersErr.message }, 500)

    recipientCandidates = (chatMembers ?? []).map((m) => ({
      id: String(m.id),
      user_id: String(m.user_id),
    }))
  }

  // Keep only linked accounts with an active `member` role. One query instead
  // of one role lookup per member (previous implementation was O(n) queries).
  const candidateUserIds = [
    ...new Set(
      recipientCandidates
        .map((m) => m.user_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ]

  let eligibleUserIds = new Set<string>()
  if (candidateUserIds.length > 0) {
    const { data: roleRows, error: roleRowsErr } = await admin
      .from('user_roles')
      .select('user_id, role, status')
      .in('user_id', candidateUserIds)
      .eq('role', 'member')
      .eq('status', 'active')
    if (roleRowsErr) return json(req, { error: roleRowsErr.message }, 500)
    eligibleUserIds = new Set((roleRows ?? []).map((r) => String(r.user_id)))
  }

  const recipients: Recipient[] = recipientCandidates
    .filter((m) => m.user_id && eligibleUserIds.has(m.user_id))
    .map((m) => ({ memberId: String(m.id), userId: String(m.user_id) }))

  if (recipients.length === 0) {
    return json(
      req,
      {
        sent: 0,
        failed: 0,
        already_sent: 0,
        invalid_tokens: 0,
        recipients: 0,
        total_devices: 0,
        skipped: 'no eligible recipients',
      },
      200,
    )
  }

  // ------------------------------------------------------------------
  // 4. Retrieve active FCM device tokens for the eligible recipients
  // ------------------------------------------------------------------
  // Service-role client is required here: device_tokens RLS only lets a
  // member read their own tokens, so a super_admin caller would otherwise
  // see an empty list and never deliver push notifications.
  const recipientMemberIds = recipients.map((r) => r.memberId)

  const { data: tokenRows, error: tokenErr } = await admin
    .from('device_tokens')
    .select('id, member_id, token, platform')
    .in('member_id', recipientMemberIds)
    .eq('is_active', true)
  if (tokenErr) return json(req, { error: tokenErr.message }, 500)

  const devices: DeviceRow[] = (tokenRows ?? []).filter(
    (row): row is DeviceRow => typeof row.token === 'string' && row.token.length > 0,
  )

  let pushTitle: string
  let pushBody: string
  let pushDestination: string

  if (notification_type === 'chat_message') {
    pushTitle = 'New message'
    const { data: msgRow } = await admin
      .from('chat_messages')
      .select('body, channel, recipient_id')
      .eq('id', message_id)
      .maybeSingle()
    pushBody =
      msgRow && typeof msgRow.body === 'string' ? String(msgRow.body) : ''
    const isPrivate = msgRow?.channel === 'private'
    const otherUserId = isPrivate && msgRow?.recipient_id
      ? String(msgRow.recipient_id)
      : null
    pushDestination = isPrivate && otherUserId && UUID_RE.test(otherUserId)
      ? `/chat?tab=private&with=${otherUserId}`
      : '/chat'
  } else {
    pushTitle = cleanTitle
    pushBody = cleanMessage
    pushDestination =
      notification_type === 'attendance_reminder' ? '/my-attendance' : '/notifications'
  }

  const notificationIdByUser = new Map<string, string>()

  for (const recipient of recipients) {
    const { data: updated, error: updateErr } = await admin
      .from('notifications')
      .update({
        title: pushTitle,
        message: pushBody,
        is_read: false,
        destination: pushDestination,
        created_by: callerId,
        created_at: new Date().toISOString(),
      })
      .eq('user_id', recipient.userId)
      .eq('type', notification_type)
      .eq('reference_id', notificationRefId)
      .select('id')

    if (updateErr) return json(req, { error: updateErr.message }, 500)

    if (updated && updated.length > 0) {
      notificationIdByUser.set(recipient.userId, String(updated[0].id))
      continue
    }

    const { data: inserted, error: insertErr } = await admin
      .from('notifications')
      .insert({
        user_id: recipient.userId,
        type: notification_type,
        title: pushTitle,
        message: pushBody,
        destination: pushDestination,
        reference_id: notificationRefId,
        created_by: callerId,
      })
      .select('id')
      .single()

    if (insertErr) {
      // Unique-index race: another request created it between update and
      // insert. Re-read it instead of failing the whole send.
      const { data: existing } = await admin
        .from('notifications')
        .select('id')
        .eq('user_id', recipient.userId)
        .eq('type', notification_type)
        .eq('reference_id', notificationRefId)
        .maybeSingle()
      if (existing) {
        notificationIdByUser.set(recipient.userId, String(existing.id))
        continue
      }
      return json(req, { error: insertErr.message }, 500)
    }

    notificationIdByUser.set(recipient.userId, String(inserted.id))
  }

  // ------------------------------------------------------------------
  // 6. No registered devices: the in-app notification is still delivered
  // ------------------------------------------------------------------
  if (devices.length === 0) {
    return json(
      req,
      {
        sent: 0,
        failed: 0,
        already_sent: 0,
        invalid_tokens: 0,
        recipients: recipients.length,
        total_devices: 0,
        skipped: 'no registered devices',
      },
      200,
    )
  }

  // ------------------------------------------------------------------
  // 7. Skip devices that already received this notification successfully
  // ------------------------------------------------------------------
  const notificationIds = [...new Set(notificationIdByUser.values())]
  const alreadySentKeys = new Set<string>()

  if (notificationIds.length > 0) {
    const { data: priorLogs, error: priorErr } = await admin
      .from('push_send_logs')
      .select('notification_id, device_token')
      .in('notification_id', notificationIds)
      .eq('status', 'sent')
    if (priorErr) return json(req, { error: priorErr.message }, 500)
    for (const log of priorLogs ?? []) {
      if (log.notification_id && log.device_token) {
        alreadySentKeys.add(`${log.notification_id}:${log.device_token}`)
      }
    }
  }

  const userIdByMemberId = new Map(recipients.map((r) => [r.memberId, r.userId]))

  // ------------------------------------------------------------------
  // 8. Send via Firebase Cloud Messaging HTTP v1
  // ------------------------------------------------------------------
  // Obtain an OAuth2 access token using the service account credentials.
  // The PEM private key must be decoded to bytes before importKey(); passing
  // the raw string was the original 500 root cause.
  let accessToken: string
  try {
    accessToken = await getGoogleAccessToken(clientEmail!, privateKey!)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return json(req, { error: `Failed to obtain FCM access token: ${detail}` }, 500)
  }

  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`
  const results: SendResult[] = []
  const logs: PushLogRow[] = []
  const invalidTokens: string[] = []
  const deliveredTokens: string[] = []

  let sent = 0
  let failed = 0
  let alreadySent = 0

  for (const device of devices) {
    const userId = userIdByMemberId.get(String(device.member_id))
    if (!userId) continue

    const notificationId = notificationIdByUser.get(userId) ?? null

    if (notificationId && alreadySentKeys.has(`${notificationId}:${device.token}`)) {
      alreadySent++
      results.push({ token: maskToken(device.token), status: 'already_sent' })
      continue
    }

    const nowMillis = Date.now()
    const channelId =
      notification_type === 'attendance_reminder'
        ? 'aca_attendance_v2'
        : notification_type === 'prayer_reminder'
          ? 'aca_prayer_v2'
          : notification_type === 'chat_message'
            ? 'aca_chat_v2'
            : 'aca_general_v2'

    const fcmPayload = {
      message: {
        token: device.token,
        notification: {
          title: pushTitle,
          body: pushBody,
          icon: 'ic_stat_notify',
          sound: 'default',
          tag: notificationRefId,
        },
        android: {
          priority: 'high',
          notification: {
            channel_id: channelId,
            sound: 'default',
            icon: 'ic_stat_notify',
            default_sound: true,
            default_vibrate_timings: true,
            notification_priority: 'PRIORITY_HIGH',
            visibility: 'VISIBILITY_PUBLIC',
            event_time: nowMillis,
            tag: notificationRefId,
          },
        },
        data: {
          type: notification_type,
          reference_id: notificationRefId,
          destination: pushDestination,
        },
      },
    }

    try {
      const resp = await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fcmPayload),
      })

      if (resp.ok) {
        await resp.text()
        sent++
        deliveredTokens.push(device.token)
        results.push({ token: maskToken(device.token), status: 'sent' })
        logs.push({
          recipient_user: userId,
          notification_id: notificationId,
          type: notification_type,
          reference_id: notificationRefId,
          status: 'sent',
          device_token: device.token,
          error_message: null,
        })
        continue
      }

      const bodyText = await resp.text()
      const errorInfo = classifyFcmError(resp.status, bodyText)

      if (errorInfo.invalidToken) {
        invalidTokens.push(device.token)
        failed++
        results.push({
          token: maskToken(device.token),
          status: 'invalid_token',
          error: errorInfo.message,
        })
        logs.push({
          recipient_user: userId,
          notification_id: notificationId,
          type: notification_type,
          reference_id: notificationRefId,
          status: 'invalid_token',
          device_token: device.token,
          error_message: errorInfo.message,
        })
        continue
      }

      failed++
      results.push({
        token: maskToken(device.token),
        status: 'failed',
        error: errorInfo.message,
      })
      logs.push({
        recipient_user: userId,
        notification_id: notificationId,
        type: notification_type,
        reference_id: notificationRefId,
        status: 'failed',
        device_token: device.token,
        error_message: errorInfo.message,
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      failed++
      results.push({ token: maskToken(device.token), status: 'failed', error: detail })
      logs.push({
        recipient_user: userId,
        notification_id: notificationId,
        type: notification_type,
        reference_id: notificationRefId,
        status: 'failed',
        device_token: device.token,
        error_message: detail,
      })
    }
  }

  // ------------------------------------------------------------------
  // 9. Mark invalid tokens inactive, refresh last_used_at for good ones
  // ------------------------------------------------------------------
  if (invalidTokens.length > 0) {
    const { error: deactivateErr } = await admin
      .from('device_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('token', invalidTokens)
    if (deactivateErr) {
      console.error('Failed to deactivate invalid tokens:', deactivateErr.message)
    }
  }

  if (deliveredTokens.length > 0) {
    const { error: usedErr } = await admin
      .from('device_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .in('token', deliveredTokens)
    if (usedErr) {
      console.error('Failed to update last_used_at:', usedErr.message)
    }
  }

  // ------------------------------------------------------------------
  // 10. Record push send logs (best-effort, insert-only)
  // ------------------------------------------------------------------
  if (logs.length > 0) {
    const { error: logErr } = await admin.from('push_send_logs').insert(logs)
    if (logErr) {
      // Non-fatal: delivery already happened; never fail the response because
      // the audit row could not be written.
      console.error('Failed to write push_send_logs:', logErr.message)
    }
  }

  return json(req, {
    sent,
    failed,
    already_sent: alreadySent,
    invalid_tokens: invalidTokens.length,
    recipients: recipients.length,
    total_devices: devices.length,
    results,
  })
})

// ---------------------------------------------------------------------------
// Firebase service-account → OAuth2 access token
// ---------------------------------------------------------------------------
async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }

  const header = { alg: 'RS256', typ: 'JWT' }
  const base64Url = (data: string) =>
    btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const signingInput =
    base64Url(JSON.stringify(header)) + '.' + base64Url(JSON.stringify(payload))

  const pemBody = privateKey
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')

  let binary: string
  try {
    binary = atob(pemBody)
  } catch {
    throw new Error('FIREBASE_PRIVATE_KEY is not valid PEM/base64 data')
  }

  const keyBuffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) keyBuffer[i] = binary.charCodeAt(i)

  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  )
  const signatureB64 = base64Url(
    String.fromCharCode.apply(null, Array.from(new Uint8Array(signature))),
  )
  const jwt = `${signingInput}.${signatureB64}`

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenText = await tokenResp.text()
  if (!tokenResp.ok) {
    throw new Error(`FCM token request failed (HTTP ${tokenResp.status}): ${safeSnippet(tokenText)}`)
  }

  let tokenData: { access_token?: string }
  try {
    tokenData = JSON.parse(tokenText)
  } catch {
    throw new Error('FCM token response was not valid JSON')
  }

  if (!tokenData.access_token) throw new Error('FCM token response did not include access_token')
  return tokenData.access_token
}

// ---------------------------------------------------------------------------
// FCM error classification
// ---------------------------------------------------------------------------
// Only a token-level failure may deactivate a device. A malformed payload
// (e.g. an unknown field) must never deactivate real users' tokens.
function classifyFcmError(
  status: number,
  bodyText: string,
): { invalidToken: boolean; message: string } {
  let parsed: any = null
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    /* not JSON */
  }

  const errStatus = parsed?.error?.status as string | undefined
  const errMessage = (parsed?.error?.message as string | undefined) ?? safeSnippet(bodyText)
  const details = Array.isArray(parsed?.error?.details) ? parsed.error.details : []
  const errorCode = details.find((d: any) => d && typeof d.errorCode === 'string')?.errorCode

  const lower = `${errStatus ?? ''} ${errorCode ?? ''} ${errMessage}`.toLowerCase()
  const invalidToken =
    status === 404 ||
    errStatus === 'NOT_FOUND' ||
    errorCode === 'UNREGISTERED' ||
    (errorCode === 'INVALID_ARGUMENT' && lower.includes('registration token')) ||
    lower.includes('requested entity was not found') ||
    lower.includes('not a valid fcm registration token')

  return { invalidToken, message: safeSnippet(errMessage) }
}

function safeSnippet(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 300 ? `${clean.slice(0, 300)}…` : clean
}
