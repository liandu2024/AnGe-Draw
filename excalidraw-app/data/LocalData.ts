/**
 * This file deals with saving data state (appState, elements, images, ...)
 * locally to the browser.
 *
 * Notes:
 *
 * - DataState refers to full state of the app: appState, elements, images,
 *   though some state is saved separately (collab username, library) for one
 *   reason or another. We also save different data to different storage
 *   (localStorage, indexedDB).
 */

import { clearAppStateForLocalStorage } from "@excalidraw/excalidraw/appState";
import {
  CANVAS_SEARCH_TAB,
  DEFAULT_SIDEBAR,
  debounce,
} from "@excalidraw/common";
import {
  createStore,
  entries,
  del,
  getMany,
  set,
  setMany,
  get,
} from "idb-keyval";

import { appJotaiStore, atom } from "excalidraw-app/app-jotai";
import { getNonDeletedElements } from "@excalidraw/element";

import type { LibraryPersistedData } from "@excalidraw/excalidraw/data/library";
import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";
import type { MaybePromise } from "@excalidraw/common/utility-types";

import { SAVE_TO_LOCAL_STORAGE_TIMEOUT, STORAGE_KEYS } from "../app_constants";

import { FileManager } from "./FileManager";
import { FileStatusStore } from "./fileStatusStore";
import { Locker } from "./Locker";
import { updateBrowserStateVersion } from "./tabSync";
import axios from 'axios';

const filesStore = createStore("files-db", "files-store");

export const localStorageQuotaExceededAtom = atom(false);

class LocalFileManager extends FileManager {
  clearObsoleteFiles = async (opts: { currentFileIds: FileId[] }) => {
    await entries(filesStore).then((entries) => {
      for (const [id, imageData] of entries as [FileId, BinaryFileData][]) {
        // if image is unused (not on canvas) & is older than 1 day, delete it
        // from storage. We check `lastRetrieved` we care about the last time
        // the image was used (loaded on canvas), not when it was initially
        // created.
        if (
          (!imageData.lastRetrieved ||
            Date.now() - imageData.lastRetrieved > 24 * 3600 * 1000) &&
          !opts.currentFileIds.includes(id as FileId)
        ) {
          del(id, filesStore);
        }
      }
    });
  };
}

const saveDataStateToLocalStorage = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
) => {
  const localStorageQuotaExceeded = appJotaiStore.get(
    localStorageQuotaExceededAtom,
  );
  try {
    const _appState = clearAppStateForLocalStorage(appState);

    if (
      _appState.openSidebar?.name === DEFAULT_SIDEBAR.name &&
      _appState.openSidebar.tab === CANVAS_SEARCH_TAB
    ) {
      _appState.openSidebar = null;
    }

    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS,
      JSON.stringify(getNonDeletedElements(elements)),
    );
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_APP_STATE,
      JSON.stringify(_appState),
    );
    updateBrowserStateVersion(STORAGE_KEYS.VERSION_DATA_STATE);
    if (localStorageQuotaExceeded) {
      appJotaiStore.set(localStorageQuotaExceededAtom, false);
    }
  } catch (error: any) {
    // Unable to access window.localStorage
    console.error(error);
    if (isQuotaExceededError(error) && !localStorageQuotaExceeded) {
      appJotaiStore.set(localStorageQuotaExceededAtom, true);
    }
  }
};

const isQuotaExceededError = (error: any) => {
  return error instanceof DOMException && error.name === "QuotaExceededError";
};

type SavingLockTypes = "collaboration";

export class LocalData {
  private static _save = debounce(
    async (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
      onFilesSaved: () => void,
    ) => {
      saveDataStateToLocalStorage(elements, appState);

      await this.fileStorage.saveFiles({
        elements,
        files,
      });
      onFilesSaved();

      // Sync to the backend if logged in and looking at a valid canvas ID
      try {
        await this.forceSyncToBackend(elements, appState);
      } catch (e) {
        console.error("Failed to sync canvas to backend", e);
      }
    },
    SAVE_TO_LOCAL_STORAGE_TIMEOUT,
  );

  static async forceSyncToBackend(elements?: readonly ExcalidrawElement[], appState?: AppState, explicitCanvasId?: string) {
    console.log("[forceSyncToBackend] Starting sync", { elementsLength: elements?.length, explicitCanvasId });
    let currentElements = elements;
    let currentAppState = appState;
    
    if (!currentElements || !currentAppState) {
      console.log("[forceSyncToBackend] Missing elements or appState, trying to read from localStorage");
      const storedElements = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS);
      const storedAppState = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_APP_STATE);
      if (storedElements && storedAppState) {
        try {
          currentElements = JSON.parse(storedElements);
          currentAppState = JSON.parse(storedAppState);
          console.log("[forceSyncToBackend] Parsed localStorage elements length:", currentElements?.length);
        } catch (e) {
          console.error("[forceSyncToBackend] Failed to parse local storage for force sync", e);
          return;
        }
      } else {
        console.warn("[forceSyncToBackend] Nothing in localStorage either, aborting sync.");
        return;
      }
    }

    let canvasId = explicitCanvasId;
    if (!canvasId) {
      const urlParams = new URLSearchParams(window.location.search);
      canvasId = urlParams.get('id') || undefined;
      if (!canvasId) {
        const pathParts = window.location.pathname.split('/');
        if (pathParts[1] === 'canvas' && pathParts[2]) {
            canvasId = pathParts[2];
        }
      }
    }
    console.log("[forceSyncToBackend] Determined canvasId:", canvasId);

    const token = localStorage.getItem('token');
    if (!token) console.warn("[forceSyncToBackend] No token found in localStorage.");

    if (canvasId && token && currentElements && currentAppState) {
        const titleToSync = (!document.title || document.title === 'Excalidraw Whiteboard' || document.title === 'Untitled' || document.title === '新建画板') ? '__NEW_CANVAS__' : document.title;
        
        try {
          console.log(`[forceSyncToBackend] Attempting PUT to /api/canvases/${canvasId}`);
          await axios.put(`/api/canvases/${canvasId}`, {
                title: titleToSync,
            elements: currentElements,
            appState: clearAppStateForLocalStorage(currentAppState as AppState)
          }, {
            headers: { Authorization: `Bearer ${token}` }
          });
          console.log("[forceSyncToBackend] Successfully UPDATED canvas via PUT");
        } catch (err: any) {
          console.log("[forceSyncToBackend] PUT failed", err?.response?.status);
          if(err.response?.status === 404) {
            console.log(`[forceSyncToBackend] Canvas 404. Attempting POST to create it...`);
            // Canvas doesn't exist, create it
            try {
              await axios.post('/api/canvases', {
                id: canvasId,
                    title: titleToSync,
                elements: currentElements,
                appState: clearAppStateForLocalStorage(currentAppState as AppState)
              }, { headers: { Authorization: `Bearer ${token}` }});
              console.log("[forceSyncToBackend] Successfully CREATED canvas via POST");
            } catch (postErr) {
              console.error("[forceSyncToBackend] POST failed too", postErr);
            }
          }
        }
    } else {
      console.warn("[forceSyncToBackend] Aborted sync condition not met:", { hasCanvasId: !!canvasId, hasToken: !!token, hasElements: !!currentElements, hasAppState: !!currentAppState });
    }
  }

  /** Saves DataState, including files. Bails if saving is paused */
  static save = (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
    onFilesSaved: () => void,
  ) => {
    // we need to make the `isSavePaused` check synchronously (undebounced)
    if (!this.isSavePaused()) {
      this._save(elements, appState, files, onFilesSaved);
    }
  };

  static flushSave = () => {
    this._save.flush();
  };

  private static locker = new Locker<SavingLockTypes>();

  static pauseSave = (lockType: SavingLockTypes) => {
    this.locker.lock(lockType);
  };

  static resumeSave = (lockType: SavingLockTypes) => {
    this.locker.unlock(lockType);
  };

  static isSavePaused = () => {
    return document.hidden || this.locker.isLocked();
  };

  // ---------------------------------------------------------------------------

  static fileStorage = new LocalFileManager({
    onFileStatusChange: FileStatusStore.updateStatuses.bind(FileStatusStore),
    getFiles(ids) {
      return getMany(ids, filesStore).then(
        async (filesData: (BinaryFileData | undefined)[]) => {
          const loadedFiles: BinaryFileData[] = [];
          const erroredFiles = new Map<FileId, true>();

          const filesToSave: [FileId, BinaryFileData][] = [];

          filesData.forEach((data, index) => {
            const id = ids[index];
            if (data) {
              const _data: BinaryFileData = {
                ...data,
                lastRetrieved: Date.now(),
              };
              filesToSave.push([id, _data]);
              loadedFiles.push(_data);
            } else {
              erroredFiles.set(id, true);
            }
          });

          try {
            // save loaded files back to storage with updated `lastRetrieved`
            setMany(filesToSave, filesStore);
          } catch (error) {
            console.warn(error);
          }

          return { loadedFiles, erroredFiles };
        },
      );
    },
    async saveFiles({ addedFiles }) {
      const savedFiles = new Map<FileId, BinaryFileData>();
      const erroredFiles = new Map<FileId, BinaryFileData>();

      // before we use `storage` event synchronization, let's update the flag
      // optimistically. Hopefully nothing fails, and an IDB read executed
      // before an IDB write finishes will read the latest value.
      updateBrowserStateVersion(STORAGE_KEYS.VERSION_FILES);

      await Promise.all(
        [...addedFiles].map(async ([id, fileData]) => {
          try {
            await set(id, fileData, filesStore);
            savedFiles.set(id, fileData);
          } catch (error: any) {
            console.error(error);
            erroredFiles.set(id, fileData);
          }
        }),
      );

      return { savedFiles, erroredFiles };
    },
  });
}
export class LibraryIndexedDBAdapter {
  /** IndexedDB database and store name */
  private static idb_name = STORAGE_KEYS.IDB_LIBRARY;
  /** library data store key */
  private static key = "libraryData";

  private static store = createStore(
    `${LibraryIndexedDBAdapter.idb_name}-db`,
    `${LibraryIndexedDBAdapter.idb_name}-store`,
  );

  static async load() {
    const IDBData = await get<LibraryPersistedData>(
      LibraryIndexedDBAdapter.key,
      LibraryIndexedDBAdapter.store,
    );

    return IDBData || null;
  }

  static save(data: LibraryPersistedData): MaybePromise<void> {
    return set(
      LibraryIndexedDBAdapter.key,
      data,
      LibraryIndexedDBAdapter.store,
    );
  }
}

/** LS Adapter used only for migrating LS library data
 * to indexedDB */
export class LibraryLocalStorageMigrationAdapter {
  static load() {
    const LSData = localStorage.getItem(
      STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_LIBRARY,
    );
    if (LSData != null) {
      const libraryItems: ImportedDataState["libraryItems"] =
        JSON.parse(LSData);
      if (libraryItems) {
        return { libraryItems };
      }
    }
    return null;
  }
  static clear() {
    localStorage.removeItem(STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_LIBRARY);
  }
}
