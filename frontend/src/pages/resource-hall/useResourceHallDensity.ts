import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  getInitialResourceHallDensity,
  resolveResourceHallDensity,
  resourceHallDensityProfiles,
  type ResourceHallDensity,
  type ResourceHallDensityProfile,
} from './resourceHallConfig';

export type ResourceHallDensityState = {
  resourceDensity: ResourceHallDensity;
  densityProfile: ResourceHallDensityProfile;
  pageSize: number;
  setPageSize: Dispatch<SetStateAction<number>>;
};

/**
 * 维护资源大厅响应式密度和页量。
 *
 * 密度会影响每页数量、精选和推荐展示数量，因此窗口尺寸或页量变化时需要重置页码。
 */
export function useResourceHallDensity(onPageReset: () => void): ResourceHallDensityState {
  const initialDensity = getInitialResourceHallDensity();
  const [resourceDensity, setResourceDensity] = useState<ResourceHallDensity>(initialDensity);
  const [pageSize, setPageSize] = useState(resourceHallDensityProfiles[initialDensity].pageSize);
  const densityProfile = resourceHallDensityProfiles[resourceDensity];

  useEffect(() => {
    let resizeFrame: number | null = null;

    function applyDensity(): void {
      const nextDensity = resolveResourceHallDensity(window.innerWidth);
      setResourceDensity((currentDensity) => (
        currentDensity === nextDensity ? currentDensity : nextDensity
      ));
    }

    function updateDensity(): void {
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        applyDensity();
      });
    }

    applyDensity();
    window.addEventListener('resize', updateDensity);
    return () => {
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
      window.removeEventListener('resize', updateDensity);
    };
  }, []);

  useEffect(() => {
    setPageSize((currentPageSize) => (
      currentPageSize === densityProfile.pageSize ? currentPageSize : densityProfile.pageSize
    ));
    onPageReset();
  }, [densityProfile.pageSize, onPageReset]);

  return {
    resourceDensity,
    densityProfile,
    pageSize,
    setPageSize,
  };
}
