import React, {useEffect, useState} from 'react';
import {Sprout} from 'lucide-react';
import {getStoredImageBlob} from '../lib/offlineImages';

interface SafeImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}

export const SafeImage: React.FC<SafeImageProps> = ({src, alt, className = '', fallbackTitle}) => {
  const [failed, setFailed] = useState(false);
  // Pictures saved for offline use (/offline-img/...) are read from IndexedDB first, so they show even
  // when the service worker is unavailable (insecure http:// address) or the server is unreachable.
  const isSaved = Boolean(src && src.startsWith('/offline-img/'));
  const [resolved, setResolved] = useState<string | null>(isSaved ? null : src ?? null);

  useEffect(() => {
    setFailed(false);
    if (!src) {
      setResolved(null);
      return;
    }
    if (!isSaved) {
      setResolved(src);
      return;
    }
    let alive = true;
    let objectUrl: string | null = null;
    setResolved(null);
    void getStoredImageBlob(src).then((blob) => {
      if (!alive) return;
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setResolved(objectUrl);
      } else {
        setResolved(src); // not saved: try the network / service worker
      }
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, isSaved]);

  if (src && isSaved && resolved === null && !failed) {
    return <div aria-hidden="true" className={`bg-[#DDEFE0] ${className}`} />;
  }

  if (!src || failed || !resolved) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#DDEFE0] to-[#F3F8F0] text-[#183B2B] p-4 text-center ${className}`}
      >
        <Sprout className="w-8 h-8 text-[#16803C] mb-1.5" aria-hidden="true" />
        {fallbackTitle && <span className="text-xs font-medium text-[#183B2B]/80">{fallbackTitle}</span>}
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
