import type { Metadata } from 'next';
import './globals.css';
import TitleBar from '@/components/TitleBar';
import ToastProvider from '@/components/ToastProvider';
import ThemeProvider from '@/components/ThemeProvider';
import ProfileProvider from '@/components/ProfileProvider';
import ProfileGuard from '@/components/ProfileGuard';
import NavigationWrapper from '@/components/NavigationWrapper';
import PageTransition from '@/components/PageTransition';
import KeyboardShortcuts from '@/components/KeyboardShortcuts';
import OnboardingTour from '@/components/OnboardingTour';
import DisableReactDevTools from '@/components/DisableReactDevTools';

export const metadata: Metadata = {
  title: 'Cinestream',
  description: 'Stream movies and TV shows with a Netflix-like experience',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-netflix-bg text-netflix-light">
        <DisableReactDevTools />
        <ThemeProvider>
          <ProfileProvider>
            <ToastProvider>
              <TitleBar />
              <ProfileGuard>
                <NavigationWrapper>
                  <PageTransition>
                    {children}
                  </PageTransition>
                </NavigationWrapper>
              </ProfileGuard>
              <KeyboardShortcuts />
              <OnboardingTour />
            </ToastProvider>
          </ProfileProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
