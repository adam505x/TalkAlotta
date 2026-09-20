import { redirect } from 'next/navigation';

/**
 * Settings is no longer a page.
 *
 * It is a panel over the board, because the things it changes — how big a
 * button is, what colour a face is — are judged by looking at the board, and a
 * separate screen took that away. The route is kept only so an old bookmark or
 * a link still lands somewhere sensible: it opens the board with the panel up.
 */
export default function SettingsRedirect() {
  redirect('/board?settings=1');
}
