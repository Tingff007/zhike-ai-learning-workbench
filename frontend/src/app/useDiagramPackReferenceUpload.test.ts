import { describe, expect, it } from 'vitest';
import {
  mergeDiagramReferenceAssetIds,
  selectDiagramReferenceFiles,
} from './useDiagramPackReferenceUpload';

function file(name: string): File {
  return { name } as File;
}

describe('useDiagramPackReferenceUpload helpers', (): void => {
  it('截取最多 6 个参考图文件', (): void => {
    const files = Array.from({ length: 8 }, (_, index) => file(`ref-${index}.png`));

    expect(selectDiagramReferenceFiles(files).map((item) => item.name)).toEqual([
      'ref-0.png',
      'ref-1.png',
      'ref-2.png',
      'ref-3.png',
      'ref-4.png',
      'ref-5.png',
    ]);
    expect(selectDiagramReferenceFiles(null)).toEqual([]);
  });

  it('合并上传结果时去重、过滤空 ID 并截断 6 个', (): void => {
    const merged = mergeDiagramReferenceAssetIds(
      ['asset-1', 'asset-2', 'asset-3'],
      [
        { id: 'asset-2' },
        { id: 'asset-4' },
        { id: null },
        undefined,
        { id: 'asset-5' },
        { id: 'asset-6' },
        { id: 'asset-7' },
      ],
    );

    expect(merged).toEqual(['asset-1', 'asset-2', 'asset-3', 'asset-4', 'asset-5', 'asset-6']);
  });
});
