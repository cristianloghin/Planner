import { useEffect, useState } from 'react'
import { useAccount } from '../account'
import { AccountPanel } from '../domains/auth/components/AccountPanel'
import { useSignOut, useUpdatePassword } from '../domains/auth/mutations'
import { PeopleSettings } from '../domains/people/components/PeopleSettings'
import { usePeopleWrite, usePreferencesWrite } from '../domains/people/mutations'
import { withPersonColor, withoutPersonColor } from '../domains/people/patches'
import { usePeopleWithColors, usePreferences } from '../domains/people/queries'
import { NotificationToggle, type PushStatus } from '../domains/push/components/NotificationToggle'
import { useForgetDevice, useRegisterDevice } from '../domains/push/mutations'
import {
  currentSubscription,
  notificationPermission,
  pushConfigured,
  pushSupport,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from '../services/push'
import type { Preferences } from '../types'
import { SectionView } from '../views/Section'

/**
 * The Settings screen: who's who and their colours, this device's reminder
 * notifications, and the account. Reads the domains, asks the push service
 * where this device stands, and hands each panel plain data and callbacks.
 */
export function SettingsRoute() {
  const { accountId, userId, email } = useAccount()
  const { withColors, overrides } = usePeopleWithColors(accountId, userId)
  const { data: prefs } = usePreferences(accountId, userId)
  const peopleWrite = usePeopleWrite()
  const prefsWrite = usePreferencesWrite()
  const signOut = useSignOut()
  const updatePassword = useUpdatePassword()

  // Settings save as one document, so a change is the current document with
  // that one thing changed. Nothing to save against until the first read lands.
  const savePrefs = (next: Preferences) =>
    prefsWrite.mutate({ accountId, userId: userId as string, prefs: next })

  const rows = withColors.map((row) => ({
    ...row,
    overridden: overrides[row.person.id] !== undefined,
  }))

  return (
    <SectionView>
      <SectionView.Header>
        <SectionView.Header.Center.Title>Settings</SectionView.Header.Center.Title>
      </SectionView.Header>
      <SectionView.Body>
        <PeopleSettings
          people={rows}
          onRename={(id, name) =>
            peopleWrite.mutate({
              accountId,
              change: { kind: 'rename', id, name },
            })
          }
          onRecolor={(id, color) => prefs && savePrefs(withPersonColor(prefs, id, color))}
          onResetColor={(id) => prefs && savePrefs(withoutPersonColor(prefs, id))}
        />
        {pushConfigured && <DeviceNotifications userId={userId} />}
        <AccountPanel
          email={email}
          onChangePassword={async (password) => {
            await updatePassword.mutateAsync({ password })
          }}
          onSignOut={() => signOut.mutate()}
        />
      </SectionView.Body>
    </SectionView>
  )
}

/**
 * Per-device Web Push registration. Each device (this browser / this phone)
 * opts in separately; the row it writes is what the reminder sender delivers
 * to. The browser subscribes first; the row is only worth writing once it has.
 */
function DeviceNotifications({ userId }: { userId: string }) {
  const registerDevice = useRegisterDevice()
  const forgetDevice = useForgetDevice()
  const [status, setStatus] = useState<PushStatus>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const support = pushSupport()
      if (support !== 'ok') {
        setStatus(support)
        return
      }
      if (notificationPermission() === 'denied') {
        setStatus('denied')
        return
      }
      setStatus((await currentSubscription()) ? 'on' : 'off')
    })()
  }, [])

  async function toggle(next: boolean) {
    setBusy(true)
    setError(null)
    try {
      if (next) {
        const device = await subscribeThisDevice()
        if (device === 'denied') {
          setStatus('denied')
        } else {
          await registerDevice.mutateAsync({ ...device, userId })
          setStatus('on')
        }
      } else {
        const endpoint = await unsubscribeThisDevice()
        if (endpoint) await forgetDevice.mutateAsync({ endpoint })
        setStatus('off')
      }
    } catch (e) {
      console.error('Push toggle failed:', e)
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <NotificationToggle
      status={status}
      busy={busy}
      error={error}
      onToggle={(on) => void toggle(on)}
    />
  )
}
