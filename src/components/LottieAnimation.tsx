'use client';

import React, { useEffect, useRef, useState } from 'react';

interface LottieAnimationProps {
  animationPath: string; // Path to json in /public, e.g. '/animations/payment-waiting.json'
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
}

export default function LottieAnimation({
  animationPath,
  loop = true,
  autoplay = true,
  className = 'w-24 h-24 mx-auto',
}: LottieAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [animationData, setAnimationData] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    fetch(animationPath)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) setAnimationData(data);
      })
      .catch((err) => console.error('Error loading Lottie animation:', err));

    return () => {
      isMounted = false;
    };
  }, [animationPath]);

  useEffect(() => {
    if (!animationData || !containerRef.current) return;

    let animInstance: any = null;

    import('lottie-web').then((lottieModule) => {
      const lottie = lottieModule.default || lottieModule;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
        animInstance = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop,
          autoplay,
          animationData,
        });
      }
    });

    return () => {
      if (animInstance) {
        animInstance.destroy();
      }
    };
  }, [animationData, loop, autoplay]);

  return <div ref={containerRef} className={className} />;
}
