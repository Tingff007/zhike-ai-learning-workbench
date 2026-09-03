import { useEffect } from 'react';
import { bindScrollerActivity } from '../../lib/bindScrollerActivity';

export function ScrollerActivity(): JSX.Element | null {
  useEffect(() => bindScrollerActivity(), []);
  return null;
}
