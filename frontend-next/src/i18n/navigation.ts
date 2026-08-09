import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';
import { useLocale } from 'next-intl';

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);

export { useLocale };