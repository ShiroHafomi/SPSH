import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale;
  const normalizedLocale = routing.locales.includes(locale as any) ? locale : routing.defaultLocale;

  const messages = (await import(`../messages/${normalizedLocale}.json`)).default;

  return {
    locale: normalizedLocale,
    messages,
  };
});