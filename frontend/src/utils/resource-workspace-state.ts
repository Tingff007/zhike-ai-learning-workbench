import type { CanvasMode } from '../types/resource-workspace';
import type { CanvasType, WorkspaceMode } from '../stores/ui.store';

export function isResourceGenerationScene(workspaceMode: WorkspaceMode, canvasType: CanvasType): boolean {
  return workspaceMode === 'split' && canvasType === 'workshop';
}

export function deriveCanvasMode(activeArtifactId: string | null, activeTaskId: string | null): CanvasMode {
  if (activeArtifactId) return 'artifact';
  if (activeTaskId) return 'generating';
  return 'empty';
}

export function shouldHideAgentTraceCapsule(workspaceMode: WorkspaceMode, canvasType: CanvasType): boolean {
  return isResourceGenerationScene(workspaceMode, canvasType);
}

export type ArtifactWorkspaceMeta = {
  title: string;
  prompt: string;
  resourceType: string;
  startedAt: number;
};
