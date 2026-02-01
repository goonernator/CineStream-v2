'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { notifications, notificationTypes, formatNotificationTime, type Notification } from '@/lib/notifications';

interface NotificationCenterProps {
  isExpanded?: boolean;
  position?: 'nav' | 'bottom' | 'top';
}

// Bell icon component
const BellIcon = ({ className = '', hasUnread = false }: { className?: string; hasUnread?: boolean }) => (
  <div className="relative">
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
    {hasUnread && (
      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-netflix-red rounded-full notification-pulse" />
    )}
  </div>
);

export default function NotificationCenter({ isExpanded = false, position = 'top' }: NotificationCenterProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notificationList, setNotificationList] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Load notifications
  useEffect(() => {
    const loadNotifications = () => {
      setNotificationList(notifications.getAll());
      setUnreadCount(notifications.getUnreadCount());
    };

    loadNotifications();
    
    // Generate welcome notifications for new users
    notifications.generateWelcomeNotifications();
    loadNotifications();

    // Listen for updates
    const handleUpdate = () => loadNotifications();
    window.addEventListener('cinestream:notifications-updated', handleUpdate);
    window.addEventListener('cinestream:notification-added', handleUpdate);

    return () => {
      window.removeEventListener('cinestream:notifications-updated', handleUpdate);
      window.removeEventListener('cinestream:notification-added', handleUpdate);
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleNotificationClick = (notification: Notification) => {
    notifications.markAsRead(notification.id);
    
    if (notification.linkUrl) {
      router.push(notification.linkUrl);
    }
    
    setIsOpen(false);
  };

  const handleMarkAllRead = () => {
    notifications.markAllAsRead();
  };

  const handleClearAll = () => {
    notifications.clearAll();
  };

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    notifications.remove(id);
  };

  // Determine button and dropdown styles based on position
  const isTopNav = position === 'top';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`${
          isTopNav 
            ? `p-2 rounded-lg transition-all duration-200 ${isOpen ? 'bg-netflix-gray/20' : 'hover:bg-netflix-gray/10'}`
            : 'group w-full flex items-center px-4 py-3 transition-all duration-200 hover:bg-netflix-bg/50 hover:shadow-md'
        }`}
        data-tour="notifications"
        title="Notifications"
      >
        <BellIcon
          className={`${isTopNav ? 'w-5 h-5' : 'w-6 h-6'} flex-shrink-0 ${
            isTopNav 
              ? isOpen ? 'text-netflix-light' : 'text-netflix-gray hover:text-netflix-light'
              : 'text-netflix-light group-hover:text-netflix-red'
          } transition-colors`}
          hasUnread={unreadCount > 0}
        />
        {!isTopNav && isExpanded && (
          <span className="ml-4 text-sm text-netflix-light group-hover:text-netflix-red transition-colors flex items-center gap-2">
            Notifications
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 bg-netflix-red text-white text-xs rounded-full min-w-[18px] text-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className={`${
            isTopNav 
              ? 'absolute right-0 top-full mt-2' 
              : 'fixed z-[200]'
          } w-[340px] bg-netflix-dark border border-netflix-gray/30 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50`}
          style={!isTopNav ? { 
            left: isExpanded ? '244px' : '68px',
            bottom: position === 'bottom' ? '16px' : 'auto',
            top: position === 'bottom' ? 'auto' : '0',
          } : undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-netflix-gray/30 bg-netflix-dark">
            <h3 className="font-semibold text-netflix-light">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-netflix-gray hover:text-netflix-light transition-colors"
                >
                  Mark all read
                </button>
              )}
              {notificationList.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-xs text-netflix-gray hover:text-netflix-red transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto bg-netflix-dark">
            {notificationList.length === 0 ? (
              <div className="p-8 text-center bg-netflix-dark">
                <BellIcon className="w-12 h-12 text-netflix-gray/50 mx-auto mb-3" />
                <p className="text-sm text-netflix-gray">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-netflix-gray/20">
                {notificationList.map((notification) => {
                  const typeConfig = notificationTypes[notification.type];
                  
                  return (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`p-4 cursor-pointer transition-colors relative group ${
                        !notification.read 
                          ? 'bg-netflix-dark border-l-2 border-netflix-red' 
                          : 'bg-netflix-bg hover:bg-netflix-dark'
                      }`}
                    >
                      {/* Unread indicator */}
                      {!notification.read && (
                        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-netflix-red rounded-full" />
                      )}

                      <div className="flex gap-3">
                        {/* Image or icon */}
                        <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${typeConfig.bgColor} flex items-center justify-center overflow-hidden`}>
                          {notification.imageUrl ? (
                            <Image
                              src={notification.imageUrl}
                              alt=""
                              width={40}
                              height={40}
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <span className={`text-lg ${typeConfig.color}`}>
                              {notification.type === 'new_release' && '🎬'}
                              {notification.type === 'continue_watching' && '▶️'}
                              {notification.type === 'new_episode' && '📺'}
                              {notification.type === 'recommendation' && '✨'}
                              {notification.type === 'trending' && '🔥'}
                              {notification.type === 'whats_new' && '🆕'}
                            </span>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-netflix-light line-clamp-1">
                              {notification.title}
                            </p>
                            {/* Remove button */}
                            <button
                              onClick={(e) => handleRemove(e, notification.id)}
                              className="opacity-0 group-hover:opacity-100 text-netflix-gray hover:text-netflix-red transition-all p-0.5"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <p className="text-xs text-netflix-gray line-clamp-2 mt-0.5">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs ${typeConfig.color}`}>
                              {typeConfig.label}
                            </span>
                            <span className="text-xs text-netflix-gray/60">
                              • {formatNotificationTime(notification.timestamp)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
