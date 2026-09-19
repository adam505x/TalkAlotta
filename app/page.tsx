import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/profile';

export const dynamic = 'force-dynamic';

/**
 * First run goes to setup, afterwards straight to the board. No logins: one
 * communicator, one profile on this device.
 */
export default function Home() {
  const profile = getProfile();
  redirect(profile.onboarded ? '/board' : '/onboarding');
}
