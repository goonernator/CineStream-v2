'use client';

import { useEffect } from 'react';
import { startNotificationService, stopNotificationService } from '@/lib/notificationService';

/**
 * NotificationService component
 * Initializes and manages the periodic notification checking service
 */
export default function NotificationService() {
  useEffect(() => {
    // Start the notification service when component mounts
    startNotificationService();

    // Cleanup: stop the service when component unmounts
    return () => {
      stopNotificationService();
    };
  }, []);

  // This component doesn't render anything
  return null;
}

