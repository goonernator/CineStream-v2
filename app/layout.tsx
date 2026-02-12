import type { Metadata } from 'next';
import './globals.css';
import TitleBar from '@/components/TitleBar';
import ToastProvider from '@/components/ToastProvider';
import ThemeProvider from '@/components/ThemeProvider';
import LayoutProvider from '@/components/LayoutProvider';
import ProfileProvider from '@/components/ProfileProvider';
import ProfileGuard from '@/components/ProfileGuard';
import NavigationWrapper from '@/components/NavigationWrapper';
import PageTransition from '@/components/PageTransition';
import KeyboardShortcuts from '@/components/KeyboardShortcuts';
import OnboardingTour from '@/components/OnboardingTour';
import DisableReactDevTools from '@/components/DisableReactDevTools';
import ErrorBoundary from '@/components/ErrorBoundary';
import NotificationService from '@/components/NotificationService';

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
        <ErrorBoundary>
          <ThemeProvider>
            <LayoutProvider>
              <ProfileProvider>
              <ToastProvider>
                <TitleBar />
                <ProfileGuard>
                  <NavigationWrapper>
                    <PageTransition>
                      <ErrorBoundary>
                        {children}
                      </ErrorBoundary>
                    </PageTransition>
                  </NavigationWrapper>
                </ProfileGuard>
                <KeyboardShortcuts />
                <OnboardingTour />
                <NotificationService />
              </ToastProvider>
            </ProfileProvider>
            </LayoutProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
