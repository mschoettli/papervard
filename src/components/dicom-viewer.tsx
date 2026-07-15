"use client";

import { useEffect, useRef, useState } from "react";

type DicomViewerProps = {
  documentId: string;
  seriesId: string;
  instanceIds: string[];
};

const toolChoices = [
  ["WindowLevel", "Fenster"],
  ["Pan", "Verschieben"],
  ["Zoom", "Zoom"],
  ["Length", "Länge"],
  ["RectangleROI", "ROI"],
  ["Angle", "Winkel"]
] as const;

export function DicomViewer({ documentId, seriesId, instanceIds }: DicomViewerProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<{ viewport?: { scroll: (delta: number) => void }; setTool?: (name: string) => void; destroy?: () => void }>({});
  const [activeTool, setActiveTool] = useState("WindowLevel");
  const [cine, setCine] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    let cineTimer: ReturnType<typeof setInterval> | undefined;
    async function start() {
      if (!elementRef.current || instanceIds.length === 0) return;
      try {
        const core = await import("@cornerstonejs/core");
        const dicomLoader = await import("@cornerstonejs/dicom-image-loader");
        const tools = await import("@cornerstonejs/tools");
        await core.init();
        dicomLoader.init({ maxWebWorkers: Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)) });
        tools.init();

        const classes = [tools.WindowLevelTool, tools.PanTool, tools.ZoomTool, tools.StackScrollTool, tools.LengthTool, tools.RectangleROITool, tools.AngleTool];
        for (const ToolClass of classes) {
          try { tools.addTool(ToolClass); } catch { /* registered by another viewer */ }
        }

        const renderingEngineId = `dicom-engine-${documentId}`;
        const viewportId = `dicom-viewport-${documentId}`;
        const toolGroupId = `dicom-tools-${documentId}`;
        const renderingEngine = new core.RenderingEngine(renderingEngineId);
        renderingEngine.enableElement({ viewportId, element: elementRef.current, type: core.Enums.ViewportType.STACK });
        const viewport = renderingEngine.getViewport(viewportId) as import("@cornerstonejs/core").Types.IStackViewport;
        await viewport.setStack(instanceIds.map((id) => `wadouri:${window.location.origin}/api/dicom/instances/${id}/file`));
        viewport.render();

        const annotationResponse = await fetch(`/api/dicom/annotations/${documentId}?seriesId=${encodeURIComponent(seriesId)}`);
        if (annotationResponse.ok) {
          const payload = await annotationResponse.json() as { annotations?: Array<{ data: Record<string, unknown> }> };
          for (const saved of payload.annotations ?? []) {
            try {
              tools.annotation.state.addAnnotation(saved.data as import("@cornerstonejs/tools").Types.Annotation, elementRef.current);
            } catch {
              // An annotation can become incompatible after a codec/tool update;
              // the remaining measurements should still be restored.
            }
          }
          viewport.render();
        }

        const toolGroup = tools.ToolGroupManager.createToolGroup(toolGroupId);
        for (const ToolClass of classes) toolGroup?.addTool(ToolClass.toolName);
        toolGroup?.addViewport(viewportId, renderingEngineId);
        toolGroup?.setToolActive(tools.WindowLevelTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] });
        toolGroup?.setToolActive(tools.StackScrollTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }] });

        const setTool = (name: string) => {
          for (const [candidate] of toolChoices) toolGroup?.setToolPassive(candidate);
          toolGroup?.setToolActive(name, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] });
        };
        runtimeRef.current = {
          viewport,
          setTool,
          destroy: () => {
            if (cineTimer) clearInterval(cineTimer);
            tools.ToolGroupManager.destroyToolGroup(toolGroupId);
            renderingEngine.destroy();
          }
        };

        const saveAnnotation = async (event: Event) => {
          const detail = (event as CustomEvent).detail as { annotation?: Record<string, unknown> };
          if (!detail?.annotation) return;
          await fetch(`/api/dicom/annotations/${documentId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seriesId, kind: "measurement", data: detail.annotation })
          });
        };
        core.eventTarget.addEventListener(tools.Enums.Events.ANNOTATION_COMPLETED, saveAnnotation);
        const priorDestroy = runtimeRef.current.destroy;
        runtimeRef.current.destroy = () => {
          core.eventTarget.removeEventListener(tools.Enums.Events.ANNOTATION_COMPLETED, saveAnnotation);
          priorDestroy?.();
        };
      } catch (caught) {
        if (!disposed) setError(caught instanceof Error ? caught.message : "DICOM-Viewer konnte nicht gestartet werden.");
      }
    }
    void start();
    return () => { disposed = true; runtimeRef.current.destroy?.(); };
  }, [documentId, instanceIds, seriesId]);

  useEffect(() => {
    if (!cine) return;
    const timer = setInterval(() => runtimeRef.current.viewport?.scroll(1), 180);
    return () => clearInterval(timer);
  }, [cine]);

  function activate(name: string) {
    setActiveTool(name);
    runtimeRef.current.setTool?.(name);
  }

  return (
    <div className="flex min-h-[680px] flex-col bg-neutral-950 text-white">
      <div className="flex flex-wrap gap-2 border-b border-white/15 p-2" role="toolbar" aria-label="DICOM-Werkzeuge">
        {toolChoices.map(([name, label]) => (
          <button key={name} type="button" onClick={() => activate(name)} aria-pressed={activeTool === name} className={`min-h-11 rounded px-3 text-sm ${activeTool === name ? "bg-blue-600" : "bg-white/10 hover:bg-white/20"}`}>{label}</button>
        ))}
        <button type="button" onClick={() => setCine((value) => !value)} aria-pressed={cine} className={`min-h-11 rounded px-3 text-sm ${cine ? "bg-emerald-600" : "bg-white/10 hover:bg-white/20"}`}>Cine</button>
      </div>
      {error ? <p role="alert" className="m-4 rounded bg-red-950 p-4 text-sm text-red-100">{error}</p> : null}
      <div ref={elementRef} className="min-h-[620px] flex-1 touch-none" onContextMenu={(event) => event.preventDefault()} />
    </div>
  );
}
