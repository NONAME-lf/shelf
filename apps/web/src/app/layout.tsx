import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SessionProvider } from '../lib/SessionProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shelf',
  description: 'Веб-клієнт для віддаленої папки з файлами',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uk">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
