import { HeartHandshake, Home, Network, ShieldAlert, Users } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/context/auth-context'
import { useAsync } from '@/hooks/useAsync'
import { getMyAnniversary, getMyFamily, getMyRelationships } from '@/services/portal'
import { describeRelationship } from '@/lib/family-relationships'
import { formatDate, fullName } from '@/lib/format'

/**
 * "My Family" for a linked member.
 *
 * The data comes from the `get_my_family` RPC, which returns only the caller's
 * own household(s) and a restricted field set — nothing here can be widened by
 * editing the URL or client state. Until the account is linked to a member
 * record, the portal shows a pending state rather than any family data.
 */
export default function MyFamilyPage() {
  const { openMenu } = useAppShell()
  const { user } = useAuth()
  const linked = Boolean(user?.memberCode)
  const family = useAsync(() => getMyFamily(), [user?.memberCode])
  const relationships = useAsync(() => getMyRelationships(), [user?.memberCode])
  const anniversary = useAsync(() => getMyAnniversary(), [user?.memberCode])

  return (
    <>
      <Header
        title="My family"
        subtitle="The household(s) your member record belongs to."
        onMenuClick={openMenu}
      />
      <Page className="space-y-6">
        {!linked && (
          <Card>
            <EmptyState
              icon={ShieldAlert}
              title="Your account isn't linked yet"
              description="Once an administrator links your account to your member record, your household will appear here."
            />
          </Card>
        )}

        {linked && family.status === 'loading' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i} className="space-y-4 p-6">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </Card>
            ))}
          </div>
        )}

        {linked && family.status === 'error' && (
          <Card>
            <EmptyState
              icon={Users}
              title="Could not load your family"
              description={family.error}
              action={<Button onClick={family.reload}>Try again</Button>}
            />
          </Card>
        )}

        {linked && family.status === 'success' && family.data.length === 0 && (
          <Card>
            <EmptyState
              icon={Home}
              title="No household on file"
              description="Your member record isn't part of a household yet. Ask church staff to add your family."
            />
          </Card>
        )}

        {linked && family.status === 'success' && family.data.length > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {family.data.map((household) => (
              <Card key={household.familyCode}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                        <Home className="size-5" />
                      </span>
                      <div>
                        <CardTitle>{household.familyName}</CardTitle>
                        <p className="font-mono text-xs text-navy-400">
                          {household.familyCode}
                        </p>
                      </div>
                    </div>
                    {household.isPrimary && (
                      <Badge tone="gold">Primary</Badge>
                    )}
                  </div>
                </CardHeader>
                <ul className="divide-y divide-cream-200">
                  {household.members.map((member) => (
                    <li
                      key={member.memberCode}
                      className="flex items-center gap-3 px-6 py-3.5"
                    >
                      <Avatar
                        firstName={member.firstName}
                        lastName={member.lastName}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-navy-900">
                          {fullName(member.firstName, member.lastName)}
                          {member.isSelf && (
                            <span className="ml-2 text-xs font-normal text-navy-400">
                              (you)
                            </span>
                          )}
                        </p>
                        {member.relationship && (
                          <p className="text-xs text-navy-400 capitalize">
                            {member.relationship}
                          </p>
                        )}
                      </div>
                      {member.isSelf && <Badge tone="navy">You</Badge>}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}

        {linked && anniversary.status === 'success' && anniversary.data && (
          <Card className="flex items-center gap-4 border-gold-200 bg-gold-50 p-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gold-500 text-navy-950">
              <HeartHandshake className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-navy-900">Wedding anniversary</p>
              <p className="text-sm text-navy-600">
                {formatDate(anniversary.data.anniversaryDate)} ·{' '}
                {fullName(
                  anniversary.data.partnerFirstName,
                  anniversary.data.partnerLastName,
                )}
              </p>
            </div>
          </Card>
        )}

        {linked && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                  <Network className="size-5" />
                </span>
                <div>
                  <CardTitle>Relationships</CardTitle>
                  <p className="text-sm text-navy-500">
                    How you are connected to other members.
                  </p>
                </div>
              </div>
            </CardHeader>

            {relationships.status === 'loading' && (
              <div className="space-y-3 p-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}

            {relationships.status === 'error' && (
              <EmptyState
                icon={Users}
                title="Could not load your relationships"
                description={relationships.error}
                action={<Button onClick={relationships.reload}>Try again</Button>}
              />
            )}

            {relationships.status === 'success' &&
              relationships.data.length === 0 && (
                <p className="p-6 text-sm text-navy-400">
                  No relationships have been recorded for your record yet.
                </p>
              )}

            {relationships.status === 'success' &&
              relationships.data.length > 0 && (
                <ul className="divide-y divide-cream-200">
                  {relationships.data.map((rel) => (
                    <li
                      key={`${rel.memberCode}-${rel.type}`}
                      className="flex items-center gap-3 px-6 py-3.5"
                    >
                      <Avatar
                        firstName={rel.firstName}
                        lastName={rel.lastName}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-navy-900">
                          {fullName(rel.firstName, rel.lastName)}
                        </p>
                        <p className="text-xs text-navy-400">
                          {describeRelationship(
                            rel.type,
                            rel.subjectIsMe,
                            rel.label,
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        )}
      </Page>
    </>
  )
}
