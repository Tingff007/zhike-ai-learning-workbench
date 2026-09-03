import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/endpoints';
import type { Resource } from '../../types';

export function HallImageAssetGallery({ resource }: { resource: Resource }): JSX.Element | null {
  const assets = useMemo(
    () => resource.assets?.filter((asset) => asset.status === 'completed') ?? [],
    [resource.assets],
  );
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let disposed = false;
    const created: string[] = [];
    async function loadAssets(): Promise<void> {
      const entries = await Promise.all(
        assets.map(async (asset) => {
          try {
            const blob = await api.resourceAssetFile(asset.id);
            const url = URL.createObjectURL(blob);
            created.push(url);
            return [asset.id, url] as const;
          } catch {
            return null;
          }
        }),
      );
      if (disposed) {
        created.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setUrls(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string]>));
    }
    void loadAssets();
    return () => {
      disposed = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [assets]);

  if (!assets.length) return null;
  return (
    <div className="mb-5 grid gap-3 md:grid-cols-3">
      {assets.map((asset) => (
        <figure key={asset.id} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {urls[asset.id] ? (
            <img className="aspect-[4/3] w-full object-cover" src={urls[asset.id]} alt={asset.title} />
          ) : (
            <div className="grid aspect-[4/3] place-items-center text-xs font-bold text-slate-500">加载中</div>
          )}
          <figcaption className="border-t border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            {asset.title}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
