import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { MIME_TYPES, arrayToMap, nextAnimationFrame } from "@excalidraw/common";

import { duplicateElements } from "@excalidraw/element";

import clsx from "clsx";

import { deburr } from "../deburr";

import { useLibraryCache } from "../hooks/useLibraryItemSvg";
import { useScrollPosition } from "../hooks/useScrollPosition";
import { t } from "../i18n";

import { DefaultSidebar } from "./DefaultSidebar";
import { LibraryMenuControlButtons } from "./LibraryMenuControlButtons";
import ConfirmDialog from "./ConfirmDialog";
import { LibraryDropdownMenu } from "./LibraryMenuHeaderContent";
import {
  LibraryMenuSection,
  LibraryMenuSectionGrid,
} from "./LibraryMenuSection";

import Spinner from "./Spinner";
import Stack from "./Stack";

import { collapseDownIcon, collapseUpIcon, TrashIcon, pencilIcon } from "./icons";
import { useApp } from "./App";

import "./LibraryMenuItems.scss";

import { TextField } from "./TextField";

import { useEditorInterface } from "./App";

import { Button } from "./Button";

import type { ExcalidrawLibraryIds } from "../data/types";

import type {
  ExcalidrawProps,
  LibraryItem,
  LibraryItems,
  UIAppState,
} from "../types";

// using an odd number of items per batch so the rendering creates an irregular
// pattern which looks more organic
const ITEMS_RENDERED_PER_BATCH = 17;
// when render outputs cached we can render many more items per batch to
// speed it up
const CACHED_ITEMS_RENDERED_PER_BATCH = 64;

export default function LibraryMenuItems({
  isLoading,
  libraryItems,
  onAddToLibrary,
  onInsertLibraryItems,
  pendingElements,
  theme,
  id,
  libraryReturnUrl,
  onSelectItems,
  selectedItems,
}: {
  isLoading: boolean;
  libraryItems: LibraryItems;
  pendingElements: LibraryItem["elements"];
  onInsertLibraryItems: (libraryItems: LibraryItems) => void;
  onAddToLibrary: (elements: LibraryItem["elements"]) => void;
  libraryReturnUrl: ExcalidrawProps["libraryReturnUrl"];
  theme: UIAppState["theme"];
  id: string;
  selectedItems: LibraryItem["id"][];
  onSelectItems: (id: LibraryItem["id"][]) => void;
}) {
  const editorInterface = useEditorInterface();
  const { library } = useApp();
  const libraryContainerRef = useRef<HTMLDivElement>(null);
  const scrollPosition = useScrollPosition<HTMLDivElement>(libraryContainerRef);

  // This effect has to be called only on first render, therefore  `scrollPosition` isn't in the dependency array
  useEffect(() => {
    if (scrollPosition > 0) {
      libraryContainerRef.current?.scrollTo(0, scrollPosition);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { svgCache } = useLibraryCache();
  const [lastSelectedItem, setLastSelectedItem] = useState<
    LibraryItem["id"] | null
  >(null);

  const [searchInputValue, setSearchInputValue] = useState("");
  const [activeTab, setActiveTab] = useState<"personal" | "excalidraw">("excalidraw");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const unpublishedItems = useMemo(
    () => libraryItems.filter((item) => item.status !== "published"),
    [libraryItems],
  );

  const publishedItems = useMemo(
    () => libraryItems.filter((item) => item.status === "published"),
    [libraryItems],
  );

  // Auto-switch to 官方库 tab when published items are imported
  const prevPublishedCountRef = useRef(publishedItems.length);
  useEffect(() => {
    if (prevPublishedCountRef.current === 0 && publishedItems.length > 0) {
      setActiveTab("excalidraw");
    }
    prevPublishedCountRef.current = publishedItems.length;
  }, [publishedItems.length]);

  // Drag-and-drop state for group reordering (官方库)
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);

  const handleGroupDragStart = useCallback((groupName: string) => {
    setDraggedGroup(groupName);
  }, []);

  const handleGroupDragOver = useCallback((e: React.DragEvent, groupName: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverGroup(groupName);
  }, []);

  const handleGroupDragEnd = useCallback(() => {
    if (draggedGroup && dragOverGroup && draggedGroup !== dragOverGroup) {
      // Reorder the published items by swapping group positions
      const groups: string[] = [];
      const groupMap: Record<string, typeof publishedItems> = {};
      const ungrouped: typeof publishedItems = [];
      publishedItems.forEach((item) => {
        const name = item.name?.trim();
        if (name) {
          if (!groupMap[name]) {
            groupMap[name] = [];
            groups.push(name);
          }
          groupMap[name].push(item);
        } else {
          ungrouped.push(item);
        }
      });

      const dragIdx = groups.indexOf(draggedGroup);
      const dropIdx = groups.indexOf(dragOverGroup);
      if (dragIdx !== -1 && dropIdx !== -1) {
        groups.splice(dragIdx, 1);
        groups.splice(dropIdx, 0, draggedGroup);

        // Rebuild library items preserving unpublished items at front
        const reorderedPublished: typeof publishedItems = [];
        groups.forEach((name) => {
          reorderedPublished.push(...groupMap[name]);
        });
        reorderedPublished.push(...ungrouped);

        const unpubItems = libraryItems.filter((item) => item.status !== "published");
        library.setLibrary([...unpubItems, ...reorderedPublished]);
      }
    }
    setDraggedGroup(null);
    setDragOverGroup(null);
  }, [draggedGroup, dragOverGroup, publishedItems, libraryItems, library]);

  // Drag handle icon (grip dots)
  const dragHandleIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="5" r="2" />
      <circle cx="15" cy="5" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="9" cy="19" r="2" />
      <circle cx="15" cy="19" r="2" />
    </svg>
  );

  const IS_LIBRARY_EMPTY = !libraryItems.length && !pendingElements.length;

  const IS_SEARCHING = !IS_LIBRARY_EMPTY && !!searchInputValue.trim();

  const filteredItems = useMemo(() => {
    const searchQuery = deburr(searchInputValue.trim().toLowerCase());
    if (!searchQuery) {
      return [];
    }

    return libraryItems.filter((item) => {
      const itemName = item.name || "";
      return (
        itemName.trim() && deburr(itemName.toLowerCase()).includes(searchQuery)
      );
    });
  }, [libraryItems, searchInputValue]);



  const onItemSelectToggle = useCallback(
    (id: LibraryItem["id"], event: React.MouseEvent) => {
      const shouldSelect = !selectedItems.includes(id);
      const orderedItems = [...unpublishedItems, ...publishedItems];
      if (shouldSelect) {
        if (event.shiftKey && lastSelectedItem) {
          const rangeStart = orderedItems.findIndex(
            (item) => item.id === lastSelectedItem,
          );
          const rangeEnd = orderedItems.findIndex((item) => item.id === id);

          if (rangeStart === -1 || rangeEnd === -1) {
            onSelectItems([...selectedItems, id]);
            return;
          }

          const selectedItemsMap = arrayToMap(selectedItems);
          // Support both top-down and bottom-up selection by using min/max
          const minRange = Math.min(rangeStart, rangeEnd);
          const maxRange = Math.max(rangeStart, rangeEnd);
          const nextSelectedIds = orderedItems.reduce(
            (acc: LibraryItem["id"][], item, idx) => {
              if (
                (idx >= minRange && idx <= maxRange) ||
                selectedItemsMap.has(item.id)
              ) {
                acc.push(item.id);
              }
              return acc;
            },
            [],
          );
          onSelectItems(nextSelectedIds);
        } else {
          onSelectItems([...selectedItems, id]);
        }
        setLastSelectedItem(id);
      } else {
        setLastSelectedItem(null);
        onSelectItems(selectedItems.filter((_id) => _id !== id));
      }
    },
    [
      lastSelectedItem,
      onSelectItems,
      publishedItems,
      selectedItems,
      unpublishedItems,
    ],
  );

  useEffect(() => {
    // if selection is removed (e.g. via esc), reset last selected item
    // so that subsequent shift+clicks don't select a large range
    if (!selectedItems.length) {
      setLastSelectedItem(null);
    }
  }, [selectedItems]);

  const getInsertedElements = useCallback(
    (id: string) => {
      let targetElements;
      if (selectedItems.includes(id)) {
        targetElements = libraryItems.filter((item) =>
          selectedItems.includes(item.id),
        );
      } else {
        targetElements = libraryItems.filter((item) => item.id === id);
      }
      return targetElements.map((item) => {
        return {
          ...item,
          // duplicate each library item before inserting on canvas to confine
          // ids and bindings to each library item. See #6465
          elements: duplicateElements({
            type: "everything",
            elements: item.elements,
            randomizeSeed: true,
          }).duplicatedElements,
        };
      });
    },
    [libraryItems, selectedItems],
  );

  const onItemDrag = useCallback(
    (id: LibraryItem["id"], event: React.DragEvent) => {
      // we want to serialize just the ids so the operation is fast and there's
      // no race condition if people drop the library items on canvas too fast
      const data: ExcalidrawLibraryIds = {
        itemIds: selectedItems.includes(id) ? selectedItems : [id],
      };
      event.dataTransfer.setData(
        MIME_TYPES.excalidrawlibIds,
        JSON.stringify(data),
      );
    },
    [selectedItems],
  );

  const isItemSelected = useCallback(
    (id: LibraryItem["id"] | null) => {
      if (!id) {
        return false;
      }
      return selectedItems.includes(id);
    },
    [selectedItems],
  );

  const onAddToLibraryClick = useCallback(() => {
    onAddToLibrary(pendingElements);
  }, [pendingElements, onAddToLibrary]);

  const onItemClick = useCallback(
    (id: LibraryItem["id"] | null) => {
      if (id) {
        onInsertLibraryItems(getInsertedElements(id));
      }
    },
    [getInsertedElements, onInsertLibraryItems],
  );

  const itemsRenderedPerBatch =
    svgCache.size >=
    (filteredItems.length ? filteredItems : libraryItems).length
      ? CACHED_ITEMS_RENDERED_PER_BATCH
      : ITEMS_RENDERED_PER_BATCH;


  const [renamingGroup, setRenamingGroup] = useState<{ name: string; isPublished: boolean } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<{ name: string; isPublished: boolean } | null>(null);

  const submitRename = () => {
    if (renamingGroup && renameValue && renameValue.trim() && renameValue.trim() !== renamingGroup.name) {
      const updatedItems = libraryItems.map(item => {
        const itemIsPublished = item.status === "published";
        if (itemIsPublished === renamingGroup.isPublished && item.name && item.name.trim() === renamingGroup.name) {
          return { ...item, name: renameValue.trim() };
        }
        return item;
      });
      library.setLibrary(updatedItems);
    }
    setRenamingGroup(null);
  };

  const handleRenameGroup = (e: React.MouseEvent, oldName: string, isPublished: boolean = false) => {
    e.stopPropagation();
    setRenamingGroup({ name: oldName, isPublished });
    setRenameValue(oldName);
  };

  const executeDeleteGroup = () => {
    if (deleteGroupConfirm) {
      const updatedItems = libraryItems.filter(item => {
        const itemIsPublished = item.status === "published";
        return !(itemIsPublished === deleteGroupConfirm.isPublished && item.name && item.name.trim() === deleteGroupConfirm.name);
      });
      library.setLibrary(updatedItems);
      setDeleteGroupConfirm(null);
    }
  };

  const handleDeleteGroup = (e: React.MouseEvent, groupName: string, isPublished: boolean = false) => {
    e.stopPropagation();
    setDeleteGroupConfirm({ name: groupName, isPublished });
  };

  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // focus could be stolen by tab trigger button
    nextAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  const JSX_whenNotSearching = !IS_SEARCHING && (
    <>
      <DefaultSidebar.TabTriggers>
        <div className="library-tabs" style={{ margin: "0 auto" }}>
          <div className="library-tabs-container">
            <button
              className={activeTab === "excalidraw" ? "active" : ""}
              onClick={() => setActiveTab("excalidraw")}
            >
              {t("labels.excalidrawLib")}
            </button>
            <button
              className={activeTab === "personal" ? "active" : ""}
              onClick={() => setActiveTab("personal")}
            >
              {t("labels.personalLib")}
            </button>
          </div>
        </div>
      </DefaultSidebar.TabTriggers>

      {activeTab === "personal" && (
        !pendingElements.length && !unpublishedItems.length ? (
          <div className="library-menu-items__no-items">
            <div className="library-menu-items__no-items__hint">
              {t("library.hint_emptyPrivateLibrary")}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {pendingElements.length > 0 && (
              <div className="library-menu-group">
                <LibraryMenuSectionGrid>
                  <LibraryMenuSection
                    itemsRenderedPerBatch={itemsRenderedPerBatch}
                    items={[{ id: null, elements: pendingElements }]}
                    onItemSelectToggle={onItemSelectToggle}
                    onItemDrag={onItemDrag}
                    onClick={onAddToLibraryClick}
                    isItemSelected={isItemSelected}
                    svgCache={svgCache}
                  />
                </LibraryMenuSectionGrid>
              </div>
            )}
            <LibraryMenuSectionGrid>
              <LibraryMenuSection
                itemsRenderedPerBatch={itemsRenderedPerBatch}
                items={unpublishedItems}
                onItemSelectToggle={onItemSelectToggle}
                onItemDrag={onItemDrag}
                onClick={onItemClick}
                isItemSelected={isItemSelected}
                svgCache={svgCache}
              />
            </LibraryMenuSectionGrid>
          </div>
        )
      )}

      {activeTab === "excalidraw" && (
        publishedItems.length === 0 ? (
          <div className="library-menu-items__no-items">
            <div className="library-menu-items__no-items__hint">
              目前还没有导入相关的包含属性的内容。
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {(() => {
              const groups: Record<string, LibraryItem[]> = {};
              const ungrouped: LibraryItem[] = [];
              publishedItems.forEach((item) => {
                if (item.name && item.name.trim()) {
                  const groupName = item.name.trim();
                  if (!groups[groupName]) groups[groupName] = [];
                  groups[groupName].push(item);
                } else {
                  ungrouped.push(item);
                }
              });

              return (
                <>
                  {Object.entries(groups).map(([groupName, groupItems]) => {
                    const isExpanded = expandedGroups[groupName] !== false;
                    const isDragging = draggedGroup === groupName;
                    const isDragOver = dragOverGroup === groupName && draggedGroup !== groupName;
                    return (
                      <div
                        key={groupName}
                        className="library-menu-group"
                        style={{
                          display: "flex", flexDirection: "column",
                          opacity: isDragging ? 0.5 : 1,
                          borderTop: isDragOver ? "2px solid var(--color-primary)" : "2px solid transparent",
                          transition: "border-top 0.15s",
                        }}
                        onDragOver={(e) => handleGroupDragOver(e, groupName)}
                        onDrop={handleGroupDragEnd}
                      >
                        <div
                          className="library-menu-items-container__header"
                          style={{
                            fontSize: "0.85rem", padding: "0.25rem 0", color: "var(--color-primary-darker)",
                            display: "flex", justifyContent: "flex-start", alignItems: "center", cursor: "pointer", gap: "0.25rem",
                            marginBottom: isExpanded ? "0.25rem" : "0", position: "relative"
                          }}
                          onClick={() => setExpandedGroups(prev => ({ ...prev, [groupName]: !isExpanded }))}
                          onMouseEnter={(e) => {
                            const actions = e.currentTarget.querySelector('.group-actions') as HTMLElement;
                            if (actions) actions.style.display = 'flex';
                          }}
                          onMouseLeave={(e) => {
                            const actions = e.currentTarget.querySelector('.group-actions') as HTMLElement;
                            if (actions) actions.style.display = 'none';
                          }}
                        >
                          {/* Drag handle */}
                          <div
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              handleGroupDragStart(groupName);
                            }}
                            onDragEnd={handleGroupDragEnd}
                            onClick={(e) => e.stopPropagation()}
                            title="拖拽排序"
                            style={{ display: "flex", alignItems: "center", cursor: "grab", color: "var(--color-gray-40)", marginRight: "0.15rem", flexShrink: 0 }}
                          >
                            {dragHandleIcon}
                          </div>
                          {renamingGroup?.name === groupName && renamingGroup?.isPublished === true ? (
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={submitRename}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") submitRename();
                                if (e.key === "Escape") setRenamingGroup(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="library-group-rename-input"
                              style={{ border: "1px solid var(--color-primary)", borderRadius: "4px", padding: "2px 4px", fontSize: "0.85rem", width: "120px", outline: "none", color: "var(--text-primary-color)", background: "transparent" }}
                            />
                          ) : (
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{groupName}</span>
                          )}
                          <div style={{ display: "flex", alignItems: "center", width: "1.5rem", height: "1.5rem", justifyContent: "center", fill: "currentColor" }}>
                            {isExpanded ? collapseUpIcon : collapseDownIcon}
                          </div>
                          <div className="group-actions" style={{ display: 'none', marginLeft: 'auto', gap: '0.25rem', alignItems: 'center' }}>
                            <div 
                              title="重命名"
                              onClick={(e) => handleRenameGroup(e, groupName, true)}
                              style={{ width: '1.2rem', height: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-gray-10)', borderRadius: '4px', padding: '2px', cursor: 'pointer', color: 'var(--color-gray-70)', fill: 'currentColor' }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-gray-20)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-gray-10)'}
                            >
                              {pencilIcon}
                            </div>
                            <div 
                              title="删除"
                              onClick={(e) => handleDeleteGroup(e, groupName, true)}
                              style={{ width: '1.2rem', height: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffe3e3', borderRadius: '4px', padding: '2px', cursor: 'pointer', color: '#e03131', fill: 'currentColor' }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#ffc9c9'}
                              onMouseLeave={(e) => e.currentTarget.style.background = '#ffe3e3'}
                            >
                              {TrashIcon}
                            </div>
                          </div>
                        </div>
                        {isExpanded && (
                          <LibraryMenuSectionGrid>
                            <LibraryMenuSection
                              itemsRenderedPerBatch={itemsRenderedPerBatch}
                              items={groupItems}
                              onItemSelectToggle={onItemSelectToggle}
                              onItemDrag={onItemDrag}
                              onClick={onItemClick}
                              isItemSelected={isItemSelected}
                              svgCache={svgCache}
                            />
                          </LibraryMenuSectionGrid>
                        )}
                      </div>
                    );
                  })}
                  {ungrouped.length > 0 && (() => {
                    const isExpanded = expandedGroups["__ungrouped"] !== false;
                    return (
                      <div className="library-menu-group" style={{ display: "flex", flexDirection: "column", marginTop: "0.25rem" }}>
                        <div
                          className="library-menu-items-container__header"
                          style={{
                            fontSize: "0.85rem", padding: "0.25rem 0", color: "var(--color-primary-darker)",
                            display: "flex", justifyContent: "flex-start", alignItems: "center", cursor: "pointer", gap: "0.25rem",
                            marginBottom: isExpanded ? "0.25rem" : "0"
                          }}
                          onClick={() => setExpandedGroups(prev => ({ ...prev, "__ungrouped": !isExpanded }))}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>未分组 (Ungrouped)</span>
                          <div style={{ display: "flex", alignItems: "center", width: "1.5rem", height: "1.5rem", justifyContent: "center", fill: "currentColor" }}>
                            {isExpanded ? collapseUpIcon : collapseDownIcon}
                          </div>
                        </div>
                        {isExpanded && (
                          <LibraryMenuSectionGrid>
                            <LibraryMenuSection
                              itemsRenderedPerBatch={itemsRenderedPerBatch}
                              items={ungrouped}
                              onItemSelectToggle={onItemSelectToggle}
                              onItemDrag={onItemDrag}
                              onClick={onItemClick}
                              isItemSelected={isItemSelected}
                              svgCache={svgCache}
                            />
                          </LibraryMenuSectionGrid>
                        )}
                      </div>
                    );
                  })()}
                </>
              );
            })()}
          </div>
        )
      )}
    </>
  );

  const JSX_whenSearching = IS_SEARCHING && (
    <>
      <div className="library-menu-items-container__header">
        {t("library.search.heading")}
        {!isLoading && (
          <div
            className="library-menu-items-container__header__hint"
            style={{ cursor: "pointer" }}
            onPointerDown={(e) => e.preventDefault()}
            onClick={(event) => {
              setSearchInputValue("");
            }}
          >
            <kbd>esc</kbd> to clear
          </div>
        )}
      </div>
      {filteredItems.length > 0 ? (
        <LibraryMenuSectionGrid>
          <LibraryMenuSection
            itemsRenderedPerBatch={itemsRenderedPerBatch}
            items={filteredItems}
            onItemSelectToggle={onItemSelectToggle}
            onItemDrag={onItemDrag}
            onClick={onItemClick}
            isItemSelected={isItemSelected}
            svgCache={svgCache}
          />
        </LibraryMenuSectionGrid>
      ) : (
        <div className="library-menu-items__no-items">
          <div className="library-menu-items__no-items__hint">
            {t("library.search.noResults")}
          </div>
          <Button
            onPointerDown={(e) => e.preventDefault()}
            onSelect={() => {
              setSearchInputValue("");
            }}
            style={{ width: "auto", marginTop: "1rem" }}
          >
            {t("library.search.clearSearch")}
          </Button>
        </div>
      )}
    </>
  );

  return (
    <div
      className="library-menu-items-container"
      style={
        pendingElements.length ||
        unpublishedItems.length ||
        publishedItems.length
          ? { justifyContent: "flex-start" }
          : { borderBottom: 0 }
      }
    >
      <div className="library-menu-items-header">
        <TextField
          ref={searchInputRef}
          type="search"
          className={clsx("library-menu-items-container__search", {
            hideCancelButton: editorInterface.formFactor !== "phone",
          })}
          placeholder={t("library.search.inputPlaceholder")}
          value={searchInputValue}
          onChange={(value) => setSearchInputValue(value)}
        />
        <LibraryDropdownMenu
          selectedItems={selectedItems}
          onSelectItems={onSelectItems}
          className="library-menu-dropdown-container--in-heading"
        />
      </div>
      <Stack.Col
        className="library-menu-items-container__items"
        align="start"
        gap={1}
        style={{
          flex: publishedItems.length > 0 ? 1 : "0 1 auto",
          margin: IS_LIBRARY_EMPTY ? "auto" : 0,
        }}
        ref={libraryContainerRef}
      >
        {isLoading && (
          <div
            style={{
              position: "absolute",
              top: "var(--container-padding-y)",
              right: "var(--container-padding-x)",
              transform: "translateY(50%)",
            }}
          >
            <Spinner />
          </div>
        )}

        {JSX_whenNotSearching}
        {JSX_whenSearching}

        {IS_LIBRARY_EMPTY && (
          <LibraryMenuControlButtons
            style={{ padding: "16px 0", width: "100%" }}
            id={id}
            libraryReturnUrl={libraryReturnUrl}
            theme={theme}
          />
        )}
      </Stack.Col>
      {deleteGroupConfirm && (
        <ConfirmDialog
          title="确认删除分组？"
          onConfirm={executeDeleteGroup}
          onCancel={() => setDeleteGroupConfirm(null)}
          confirmText="确认删除"
        >
          <p>确定要删除 "{deleteGroupConfirm.name}" 素材组及其中所有素材吗？此操作不可恢复。</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
