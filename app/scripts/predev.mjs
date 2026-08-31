/**
 * Remove a leftover PRODUCTION build before `next dev` starts.
 *
 * Running `npm run build` while the dev server is up leaves a production build
 * in `.next/` while dev serves out of `.next/dev/`. The collision breaks route
 * registration: every `/api/*` returns 404 as an HTML page while ordinary pages
 * still render perfectly. It presents as "the admin is broken" or "the database
 * is down", never as a stale build, which is why it has cost a debugging
 * session four separate times.
 *
 * Deliberately NOT `rimraf .next`. Deleting the whole directory on every dev
 * start throws away the incremental compile cache and makes each boot a full
 * rebuild — a real daily cost to prevent an occasional mistake. A production
 * build is identifiable: `next build` writes BUILD_ID at the root of `.next/`
 * and `next dev` does not. So this removes the directory only when that marker
 * is present, and does nothing at all on a normal start.
 */
import { existsSync, rmSync } from 'fs';
import path from 'path';

const NEXT_DIR = path.join(process.cwd(), '.next');
const MARKER = path.join(NEXT_DIR, 'BUILD_ID');

if (!existsSync(MARKER)) process.exit(0);

console.log(
  '\n⚠️  A production build was left in .next/ — that is the collision that ' +
  'makes every /api/* return an HTML 404 while pages still render.\n' +
  '   Removing it so dev starts clean. Nothing else is affected.\n'
);

try {
  rmSync(NEXT_DIR, { recursive: true, force: true });
  console.log('   .next/ removed.\n');
} catch (err) {
  // Never block dev over this. Say what to do and get out of the way.
  console.error(`   Could not remove .next/: ${err.message}`);
  console.error('   Stop any running server and delete it by hand, or /api/* will 404.\n');
}
