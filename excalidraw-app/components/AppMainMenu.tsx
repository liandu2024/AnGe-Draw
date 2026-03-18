import { MainMenu } from "@excalidraw/excalidraw/index";
import React from "react";

import { isDevEnv } from "@excalidraw/common";
import type { Theme } from "@excalidraw/element/types";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import { LocalData } from "../data/LocalData";
import { STORAGE_KEYS } from "../app_constants";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { exportToSvg } from "@excalidraw/excalidraw/index";
import axios from "axios";
import { useState, useEffect, useRef } from "react";

import { LanguageList } from "../app-language/LanguageList";

const CanvasPreview: React.FC<{ elements: any, appState?: any }> = ({ elements, appState }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    if (containerRef.current && elements && elements.length > 0) {
      exportToSvg({
        elements,
        appState: { ...appState, exportBackground: true },
        files: null
      }).then(svg => {
        if (isMounted && containerRef.current) {
          containerRef.current.innerHTML = '';
          svg.setAttribute("width", "100%");
          svg.setAttribute("height", "100%");
          containerRef.current.appendChild(svg);
        }
      }).catch(console.error);
    }
    return () => { isMounted = false; };
  }, [elements, appState]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        aspectRatio: "1 / 1",
        width: "100%", 
        background: "white", 
        padding: "8px",
        boxSizing: "border-box",
        borderRadius: "4px", 
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "inset 0 0 0 1px var(--color-gray-20)",
        marginBottom: "8px"
      }}
    >
      {(!elements || elements.length === 0) && <span style={{ color: "var(--color-gray-40)", fontSize: "12px" }}>空白画板</span>}
    </div>
  );
};

const TrashIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4.5 5.5H19.5" stroke="#ff3b30" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M9 5.5V4C9 3.44772 9.44772 3 10 3H14C14.5523 3 15 3.44772 15 4V5.5" stroke="#ff3b30" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M17.5 5.5V18.5C17.5 19.6046 16.6046 20.5 15.5 20.5H8.5C7.39543 20.5 6.5 19.6046 6.5 18.5V5.5" stroke="#ff3b30" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M10 10.5V15.5" stroke="#ff3b30" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M14 10.5V15.5" stroke="#ff3b30" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const SavedCanvasesModal: React.FC<{ onClose: () => void, excalidrawAPI: any | null }> = ({ onClose, excalidrawAPI }) => {
  const [canvases, setCanvases] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [canvasToDelete, setCanvasToDelete] = useState<{id: string, title?: string} | null>(null);
  const navigate = useNavigate();

  const getCanvasIdFromUrl = () => {
    console.log("[Modal] getCanvasIdFromUrl -> href:", window.location.href, "pathname:", window.location.pathname);
    const pathParts = window.location.pathname.split('/');
    if (pathParts[1] === 'canvas' && pathParts[2]) {
        console.log("[Modal] getCanvasIdFromUrl -> returning pathParts[2]:", pathParts[2]);
        return pathParts[2];
    }
    const searchId = new URLSearchParams(window.location.search).get('id');
    console.log("[Modal] getCanvasIdFromUrl -> returning searchId:", searchId);
    return searchId || undefined;
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      axios.get("/api/canvases", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => setCanvases(res.data))
      .catch(console.error);
    }
  }, []);

  const handleOpenCanvas = async (id: string) => {
    const oldId = getCanvasIdFromUrl();
    LocalData.flushSave();
    if (excalidrawAPI) {
      await LocalData.forceSyncToBackend(excalidrawAPI.getSceneElements(), excalidrawAPI.getAppState(), oldId);
    } else {
      await LocalData.forceSyncToBackend(undefined, undefined, oldId);
    }
    onClose();
    navigate(`/canvas/${id}`);
  };

  const confirmDeleteCanvas = async () => {
    if (!canvasToDelete) return;
    const { id } = canvasToDelete;
    try {
      await axios.delete(`/api/canvases/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setCanvases(canvases.filter(c => c.id !== id));
      if (excalidrawAPI) {
        const currentUrlId = getCanvasIdFromUrl();
        if (currentUrlId === id) {
          excalidrawAPI.updateScene({ elements: [] });
          window.history.replaceState(null, '', '/');
          window.dispatchEvent(new CustomEvent('canvasTitleUpdated', { detail: { title: 'Untitled' } }));
        }
      }
    } catch (error) {
      console.error("删除画板失败:", error);
    } finally {
      setCanvasToDelete(null);
    }
  };

  const titleNode = (
    <div 
      onClick={(e) => e.stopPropagation()}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", paddingRight: "1rem" }}
    >
      <span>已保存的画板</span>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ display: "flex", gap: "0", border: "1px solid var(--color-gray-30)", borderRadius: "6px", overflow: "hidden" }}>
          <button 
            onClick={() => setViewMode("grid")}
            style={{ 
              padding: "4px 12px", 
              cursor: "pointer", 
              background: viewMode === "grid" ? "var(--color-primary-light)" : "transparent", 
              border: "none", 
              borderRight: "1px solid var(--color-gray-30)",
              color: viewMode === "grid" ? "var(--color-primary-dark)" : "var(--text-primary-color)", 
              fontSize: "14px", 
              fontWeight: viewMode === "grid" ? "bold" : "normal" 
            }}
          >
            宫格
          </button>
          <button 
            onClick={() => setViewMode("list")}
            style={{ 
              padding: "4px 12px", 
              cursor: "pointer", 
              background: viewMode === "list" ? "var(--color-primary-light)" : "transparent", 
              border: "none", 
              color: viewMode === "list" ? "var(--color-primary-dark)" : "var(--text-primary-color)", 
              fontSize: "14px", 
              fontWeight: viewMode === "list" ? "bold" : "normal" 
            }}
          >
            列表
          </button>
        </div>
        <button 
          onClick={onClose}
          style={{ 
            background: "transparent", 
            border: "none", 
            fontSize: "20px", 
            cursor: "pointer", 
            color: "var(--color-gray-60)",
            padding: "0 8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "bold",
          }}
          title="关闭"
        >
          ✕
        </button>
      </div>
    </div>
  );

  return (
    <Dialog className="SavedCanvasesModal" title={titleNode} onCloseRequest={onClose} closeOnClickOutside={false} size="wide">
      <style>{`
        .SavedCanvasesModal .Modal__content {
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
          max-height: calc(100vh - 80px) !important;
        }
        .SavedCanvasesModal .Island {
          display: flex !important;
          flex-direction: column !important;
          flex: 1 !important;
          overflow: hidden !important;
        }
        .SavedCanvasesModal .Dialog__content {
          display: flex !important;
          flex-direction: column !important;
          flex: 1 !important;
          overflow: hidden !important;
        }
      `}</style>
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{ 
          display: viewMode === "grid" ? "grid" : "flex", 
          flexDirection: viewMode === "list" ? "column" : undefined,
          gridTemplateColumns: viewMode === "grid" ? "repeat(auto-fill, minmax(200px, 1fr))" : undefined,
          gridAutoRows: viewMode === "grid" ? "max-content" : undefined,
          gap: "8px", 
          flex: 1,
          minHeight: 0,
          height: "500px", 
          overflowY: "auto",
          padding: "4px"
        }}
      >
        {canvases.length === 0 ? (
          <p style={{ width: "100%", textAlign: "center", color: "var(--color-gray-50)" }}>暂无保存的画板</p>
        ) : (
          canvases.map(canvas => {
            const isHovered = hoveredId === canvas.id;
            return (
              <div 
                key={canvas.id} 
                onClick={() => handleOpenCanvas(canvas.id)}
                onMouseEnter={() => setHoveredId(canvas.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ 
                  padding: viewMode === "grid" ? "12px" : "0 16px", 
                  border: "1px solid var(--color-gray-20)", 
                  borderRadius: "8px", 
                  cursor: "pointer", 
                  background: isHovered ? "var(--color-gray-20)" : "var(--color-gray-10)",
                  display: "flex",
                  flexDirection: viewMode === "grid" ? "column" : "row",
                  alignItems: viewMode === "list" ? "center" : "stretch",
                  justifyContent: viewMode === "grid" ? "space-between" : "space-between",
                  height: viewMode === "list" ? "40px" : "auto",
                  flexShrink: 0,
                  transition: "background 0.2s"
                }}
              >
                {viewMode === "grid" ? (
                  <>
                    <div style={{ position: "relative", width: "100%", marginBottom: "8px", borderRadius: "4px", overflow: "hidden" }}>
                      <CanvasPreview 
                        elements={typeof canvas.elements === 'string' ? JSON.parse(canvas.elements) : (canvas.elements || [])} 
                        appState={typeof canvas.appState === 'string' ? JSON.parse(canvas.appState) : (canvas.appState || {})} 
                      />
                      {isHovered && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); setCanvasToDelete({ id: canvas.id, title: canvas.title }); }}
                          style={{ position: "absolute", top: "8px", right: "8px", background: "white", border: "1px solid #e5e5e5", borderRadius: "6px", padding: "4px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px" }}
                        >
                          {TrashIcon}
                        </button>
                      )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ overflow: "hidden" }}>
                        <h3 style={{ margin: "0 0 4px 0", fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{canvas.title || "Untitled"}</h3>
                        <p style={{ margin: 0, fontSize: "11px", color: "var(--color-gray-50)" }}>最后更新: {new Date(canvas.updated_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "24px", overflow: "hidden", flex: 1 }}>
                      <h3 style={{ margin: 0, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0, width: "250px" }}>{canvas.title || "Untitled"}</h3>
                      <p style={{ margin: 0, fontSize: "12px", color: "var(--color-gray-50)", flexShrink: 0 }}>最后更新: {new Date(canvas.updated_at).toLocaleString()}</p>
                    </div>
                    {isHovered && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setCanvasToDelete({ id: canvas.id, title: canvas.title }); }}
                        style={{ background: "#ff3bc722", color: "#ff3b30", border: "none", borderRadius: "4px", padding: "4px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px" }}
                      >
                        {TrashIcon}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {canvasToDelete && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", zIndex: 999999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", padding: "24px 32px", borderRadius: "12px", width: "320px", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: "18px", color: "#1a1a1a", fontWeight: 600 }}>确认删除画板？</h3>
            <p style={{ margin: "0 0 24px", fontSize: "14px", color: "#666", lineHeight: 1.5 }}>
              您确定要删除画板 <strong>{canvasToDelete.title || "未命名画板"}</strong> 吗？<br/>此操作不可恢复。
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button 
                onClick={() => setCanvasToDelete(null)} 
                style={{ flex: 1, padding: "10px 0", borderRadius: "8px", border: "1px solid #e5e5e5", background: "white", color: "#333", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}
              >
                取消
              </button>
              <button 
                onClick={confirmDeleteCanvas} 
                style={{ flex: 1, padding: "10px 0", borderRadius: "8px", border: "none", background: "#ff3b30", color: "white", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}
              >
                确定删除
              </button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
};

export const AppMainMenu: React.FC<{
  onCollabDialogOpen: () => any;
  isCollaborating: boolean;
  isCollabEnabled: boolean;
  theme: Theme | "system";
  setTheme: (theme: Theme | "system") => void;
  refresh: () => void;
  excalidrawAPI: any | null;
  isShared?: boolean;
}> = React.memo((props) => {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const getCanvasIdFromUrl = () => {
    console.log("[MainMenu] getCanvasIdFromUrl -> href:", window.location.href, "pathname:", window.location.pathname);
    const pathParts = window.location.pathname.split('/');
    if (pathParts[1] === 'canvas' && pathParts[2]) {
        console.log("[MainMenu] getCanvasIdFromUrl -> returning pathParts[2]:", pathParts[2]);
        return pathParts[2];
    }
    const searchId = new URLSearchParams(window.location.search).get('id');
    console.log("[MainMenu] getCanvasIdFromUrl -> returning searchId:", searchId);
    return searchId || undefined;
  };

  const handleNewCanvas = async () => {
    const oldId = getCanvasIdFromUrl();
    const newId = nanoid();

    LocalData.flushSave();
    if (props.excalidrawAPI) {
      await LocalData.forceSyncToBackend(props.excalidrawAPI.getSceneElements(), props.excalidrawAPI.getAppState(), oldId);
    } else {
      await LocalData.forceSyncToBackend(undefined, undefined, oldId);
    }
    
    // Clear local storage so the new canvas doesn't inadvertently load the old one
    localStorage.removeItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS);
    localStorage.removeItem(STORAGE_KEYS.LOCAL_STORAGE_APP_STATE);

    try {
      // Immediately request the backend to create the new canvas to calculate '新建画板X'
      const token = localStorage.getItem('token');
      if (token) {
        const res = await axios.post('/api/canvases', {
          id: newId,
          title: '__NEW_CANVAS__',
          elements: [],
          appState: {}
        }, { headers: { Authorization: `Bearer ${token}` }});
        
        if (res.data && res.data.title) {
          document.title = res.data.title;
          // Dispatch a custom event so CanvasHeader in App.tsx can catch the new title
          window.dispatchEvent(new CustomEvent('canvasTitleUpdated', { detail: { title: res.data.title } }));
        }
      }
    } catch (e) {
      console.error("Failed to pre-create canvas on backend", e);
    }

    // Clear the current active board visually immediately
    if (props.excalidrawAPI) {
      props.excalidrawAPI.updateScene({ elements: [] });
    }
    
    navigate(`/canvas/${newId}`);
  };

  return (
    <>
      <MainMenu>
      {!props.isShared && (
        <>
          <MainMenu.ItemCustom>
            <button
              style={{ width: "100%", padding: "0.5rem", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontSize: "1rem", fontWeight: "bold", color: "var(--color-primary)" }}
              onClick={handleNewCanvas}
            >
              ➕ 新建画板
            </button>
          </MainMenu.ItemCustom>
          <MainMenu.Separator />
        </>
      )}
      {!props.isShared && <MainMenu.DefaultItems.LoadScene />}
      <MainMenu.DefaultItems.SaveToActiveFile />
      {!props.isShared && <MainMenu.DefaultItems.Export />}
      <MainMenu.DefaultItems.SaveAsImage />
      {!props.isShared && (
        <>
          {props.isCollabEnabled && (
            <MainMenu.DefaultItems.LiveCollaborationTrigger
              isCollaborating={props.isCollaborating}
              onSelect={() => props.onCollabDialogOpen()}
            />
          )}
          <MainMenu.DefaultItems.CommandPalette className="highlighted" />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.ItemCustom>
            <button
              style={{ width: "100%", padding: "0.5rem", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontSize: "1rem", fontWeight: "bold", color: "var(--color-primary)" }}
              onClick={() => setIsModalOpen(true)}
            >
              📁 已保存的画板
            </button>
          </MainMenu.ItemCustom>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.Preferences />
          <MainMenu.DefaultItems.ToggleTheme
            allowSystemTheme
            theme={props.theme}
            onSelect={props.setTheme}
          />
          <MainMenu.ItemCustom>
            <LanguageList style={{ width: "100%" }} />
          </MainMenu.ItemCustom>
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </>
      )}
    </MainMenu>
      {isModalOpen && <SavedCanvasesModal onClose={() => setIsModalOpen(false)} excalidrawAPI={props.excalidrawAPI} />}
    </>
  );
});
