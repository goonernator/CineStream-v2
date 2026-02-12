'use client';

import { useEffect, useRef } from 'react';
import { startNotificationService, stopNotificationService } from '@/lib/notificationService';

/**
 * NotificationService component
 * Initializes and manages the periodic notification checking service
 */
export default function NotificationService() {
  const hasStartedRef = useRef(false);

  useEffect(() => {
    // Prevent multiple starts (React StrictMode double-invocation protection)
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    
    // Start the notification service when component mounts
    try {
      startNotificationService();
    } catch (error) {
      console.error('Failed to start notification service:', error);
    }

    // Cleanup: stop the service when component unmounts
    return () => {
      hasStartedRef.current = false;
      try {
        stopNotificationService();
      } catch (error) {
        console.error('Failed to stop notification service:', error);
      }
    };
  }, []);

  // This component doesn't render anything
  return null;
}

