import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Andwell Advantage Intelligence Hub',
  description: 'Competitive healthcare service line intelligence for Andwell Health Partners.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
