import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface TargetCursorProps {
  targetSelector?: string;
  spinDuration?: number;
  hideDefaultCursor?: boolean;
}

export const TargetCursor = ({
  targetSelector = '.cursor-target',
  spinDuration = 2,
  hideDefaultCursor = true,
}: TargetCursorProps) => {
  const cursorRef = useRef<HTMLDivElement>(null);
  const cornersRef = useRef<NodeListOf<HTMLDivElement> | null>(null);
  const spinTlRef = useRef<gsap.core.Timeline | null>(null);

  const constants = {
    borderWidth: 3,
    cornerSize: 12,
    parallaxStrength: 0.00005,
  };

  useEffect(() => {
    if (!cursorRef.current) return;

    const originalCursor = document.body.style.cursor;
    if (hideDefaultCursor) {
      document.body.style.cursor = 'none';
    }

    const cursor = cursorRef.current;
    cornersRef.current = cursor.querySelectorAll<HTMLDivElement>('.target-cursor-corner');

    let activeTarget: Element | null = null;
    let currentTargetMove: ((ev: Event) => void) | null = null;
    let currentLeaveHandler: (() => void) | null = null;
    let isAnimatingToTarget = false;
    let resumeTimeout: ReturnType<typeof setTimeout> | null = null;

    const cleanupTarget = (target: Element) => {
      if (currentTargetMove) {
        target.removeEventListener('mousemove', currentTargetMove);
      }
      if (currentLeaveHandler) {
        target.removeEventListener('mouseleave', currentLeaveHandler);
      }
      currentTargetMove = null;
      currentLeaveHandler = null;
    };

    gsap.set(cursor, {
      xPercent: -50,
      yPercent: -50,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      opacity: 1,
      display: 'block',
    });

    const createSpinTimeline = () => {
      if (spinTlRef.current) {
        spinTlRef.current.kill();
      }
      spinTlRef.current = gsap
        .timeline({ repeat: -1 })
        .to(cursor, { rotation: '+=360', duration: spinDuration, ease: 'none' });
    };

    createSpinTimeline();

    const moveCursor = (x: number, y: number) => {
      if (!cursor) return;

      gsap.to(cursor, {
        x,
        y,
        duration: 0.1,
        ease: 'power3.out',
      });
    };

    const moveHandler = (e: MouseEvent) => moveCursor(e.clientX, e.clientY);
    window.addEventListener('mousemove', moveHandler);

    const enterHandler = (e: MouseEvent) => {
      const directTarget = e.target as Element;

      const allTargets: Element[] = [];
      let current = directTarget;
      while (current && current !== document.body) {
        if (current.matches(targetSelector)) {
          allTargets.push(current);
        }
        current = current.parentElement!;
      }

      const target = allTargets[0] || null;
      if (!target || !cursor || !cornersRef.current) return;

      if (activeTarget === target) return;

      if (activeTarget) {
        cleanupTarget(activeTarget);
      }

      if (resumeTimeout) {
        clearTimeout(resumeTimeout);
        resumeTimeout = null;
      }

      activeTarget = target;

      gsap.killTweensOf(cursor, 'rotation');
      spinTlRef.current?.pause();

      gsap.set(cursor, { rotation: 0 });

      const updateCorners = (mouseX?: number, mouseY?: number) => {
        const rect = target.getBoundingClientRect();
        const cursorRect = cursor.getBoundingClientRect();

        const cursorCenterX = cursorRect.left + cursorRect.width / 2;
        const cursorCenterY = cursorRect.top + cursorRect.height / 2;

        const [tlc, trc, brc, blc] = Array.from(cornersRef.current!);

        const { borderWidth, cornerSize, parallaxStrength } = constants;

        const tlOffset = {
          x: rect.left - cursorCenterX - borderWidth,
          y: rect.top - cursorCenterY - borderWidth,
        };
        const trOffset = {
          x: rect.right - cursorCenterX + borderWidth - cornerSize,
          y: rect.top - cursorCenterY - borderWidth,
        };
        const brOffset = {
          x: rect.right - cursorCenterX + borderWidth - cornerSize,
          y: rect.bottom - cursorCenterY + borderWidth - cornerSize,
        };
        const blOffset = {
          x: rect.left - cursorCenterX - borderWidth,
          y: rect.bottom - cursorCenterY + borderWidth - cornerSize,
        };

        if (mouseX !== undefined && mouseY !== undefined) {
          const targetCenterX = rect.left + rect.width / 2;
          const targetCenterY = rect.top + rect.height / 2;
          const mouseOffsetX = (mouseX - targetCenterX) * parallaxStrength;
          const mouseOffsetY = (mouseY - targetCenterY) * parallaxStrength;

          tlOffset.x += mouseOffsetX;
          tlOffset.y += mouseOffsetY;
          trOffset.x += mouseOffsetX;
          trOffset.y += mouseOffsetY;
          brOffset.x += mouseOffsetX;
          brOffset.y += mouseOffsetY;
          blOffset.x += mouseOffsetX;
          blOffset.y += mouseOffsetY;
        }

        const tl = gsap.timeline();
        const corners = [tlc, trc, brc, blc];
        const offsets = [tlOffset, trOffset, brOffset, blOffset];

        corners.forEach((corner, index) => {
          tl.to(
            corner as HTMLElement,
            {
              x: offsets[index].x,
              y: offsets[index].y,
              duration: 0.2,
              ease: 'power2.out',
            },
            0
          );
        });
      };

      isAnimatingToTarget = true;
      updateCorners();

      setTimeout(() => {
        isAnimatingToTarget = false;
      }, 1);

      let moveThrottle: number | null = null;
      const targetMove = (ev: Event) => {
        if (moveThrottle || isAnimatingToTarget) return;
        moveThrottle = requestAnimationFrame(() => {
          const mouseEvent = ev as MouseEvent;
          updateCorners(mouseEvent.clientX, mouseEvent.clientY);
          moveThrottle = null;
        });
      };

      const leaveHandler = () => {
        activeTarget = null;
        isAnimatingToTarget = false;

        if (cornersRef.current) {
          const corners = Array.from(cornersRef.current);
          gsap.killTweensOf(corners);

          const { cornerSize } = constants;
          const positions = [
            { x: -cornerSize * 1.5, y: -cornerSize * 1.5 },
            { x: cornerSize * 0.5, y: -cornerSize * 1.5 },
            { x: cornerSize * 0.5, y: cornerSize * 0.5 },
            { x: -cornerSize * 1.5, y: cornerSize * 0.5 },
          ];

          const tl = gsap.timeline();
          corners.forEach((corner, index) => {
            tl.to(
              corner as HTMLElement,
              {
                x: positions[index].x,
                y: positions[index].y,
                duration: 0.3,
                ease: 'power3.out',
              },
              0
            );
          });
        }

        resumeTimeout = setTimeout(() => {
          if (!activeTarget && cursor && spinTlRef.current) {
            const currentRotation = gsap.getProperty(cursor, 'rotation') as number;
            const normalizedRotation = currentRotation % 360;

            spinTlRef.current.kill();
            spinTlRef.current = gsap
              .timeline({ repeat: -1 })
              .to(cursor, { rotation: '+=360', duration: spinDuration, ease: 'none' });

            gsap.to(cursor, {
              rotation: normalizedRotation + 360,
              duration: spinDuration * (1 - normalizedRotation / 360),
              ease: 'none',
              onComplete: () => {
                spinTlRef.current?.restart();
              },
            });
          }
          resumeTimeout = null;
        }, 50);

        cleanupTarget(target);
      };

      currentTargetMove = targetMove;
      currentLeaveHandler = leaveHandler;

      target.addEventListener('mousemove', targetMove);
      target.addEventListener('mouseleave', leaveHandler);
    };

    window.addEventListener('mouseover', enterHandler, { passive: true });

    return () => {
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseover', enterHandler);

      if (activeTarget) {
        cleanupTarget(activeTarget);
      }

      if (resumeTimeout) {
        clearTimeout(resumeTimeout);
        resumeTimeout = null;
      }

      spinTlRef.current?.kill();
      spinTlRef.current = null;

      if (cursor) {
        gsap.killTweensOf(cursor);
      }
      if (cornersRef.current) {
        gsap.killTweensOf(Array.from(cornersRef.current));
      }

      if (cursor) {
        gsap.set(cursor, {
          x: 0,
          y: 0,
          rotation: 0,
          opacity: 0,
          display: 'none',
        });
      }

      document.body.style.cursor = originalCursor;
    };
  }, [targetSelector, spinDuration, hideDefaultCursor]);

  return (
    <div
      ref={cursorRef}
      className="fixed top-0 left-0 z-[9999] w-0 h-0 pointer-events-none mix-blend-difference opacity-0"
      style={{ willChange: 'transform' }}
    >
      <div
        className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full -translate-x-1/2 -translate-y-1/2"
        style={{ willChange: 'transform' }}
      />
      <div
        className="absolute top-1/2 left-1/2 w-3 h-3 border-[3px] border-white border-r-0 border-b-0 -translate-x-[150%] -translate-y-[150%] target-cursor-corner"
        style={{ willChange: 'transform' }}
      />
      <div
        className="absolute top-1/2 left-1/2 w-3 h-3 border-[3px] border-white border-b-0 border-l-0 -translate-y-[150%] translate-x-1/2 target-cursor-corner"
        style={{ willChange: 'transform' }}
      />
      <div
        className="absolute top-1/2 left-1/2 w-3 h-3 border-[3px] border-white border-t-0 border-l-0 translate-x-1/2 translate-y-1/2 target-cursor-corner"
        style={{ willChange: 'transform' }}
      />
      <div
        className="absolute top-1/2 left-1/2 w-3 h-3 border-[3px] border-white border-t-0 border-r-0 -translate-x-[150%] translate-y-1/2 target-cursor-corner"
        style={{ willChange: 'transform' }}
      />
    </div>
  );
};