import React, { useState, useEffect } from "react";
import { t } from "../i18n";
import { Dialog } from "./Dialog";
import { TextField } from "./TextField";
import { Button } from "./Button";
import {
  LibraryMenuSection,
} from "./LibraryMenuSection";
import { useLibraryCache } from "../hooks/useLibraryItemSvg";
import type { LibraryItems, AppClassProperties } from "../types";

export const LibraryImportDialog = ({
  items,
  app,
  onClose,
}: {
  items: LibraryItems;
  app: AppClassProperties;
  onClose: () => void;
}) => {
  const [title, setTitle] = useState("");
  const { svgCache } = useLibraryCache();

  useEffect(() => {
    // Generate default title
    const generateDefaultTitle = async () => {
      const currentItems = await app.library.getLatestLibrary();
      let defaultNum = 1;
      const nameRegex = /^素材库\s*(\d+)$/i;
      for (const item of currentItems) {
        const match = (item.name || "").match(nameRegex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num >= defaultNum) {
            defaultNum = num + 1;
          }
        }
      }
      setTitle(`素材库${defaultNum}`);
    };
    generateDefaultTitle();
  }, [app]);

  const onConfirm = async () => {
    let finalName = title.trim() || "素材库1";
    let suffix = 1;
    const currentItems = await app.library.getLatestLibrary();
    const existingNames = new Set(currentItems.map((item) => item.name));

    let uniqueName = finalName;
    while (existingNames.has(uniqueName)) {
      uniqueName = `${finalName} (${suffix})`;
      suffix++;
    }

    const nextItems = items.map((item) => ({
      ...item,
      name: uniqueName,
    }));

    app.library.updateLibrary({
      libraryItems: nextItems,
      prompt: false,
      merge: true,
    });

    app.focusContainer();
    onClose();
  };

  return (
    <Dialog
      onCloseRequest={onClose}
      title={"导入素材库 (Import Library)"}
      className="library-import-dialog"
    >
      <div className="library-import-dialog__content" style={{ position: "relative" }}>
        <label
          style={{
            display: "block",
            marginBottom: "0.5rem",
            fontWeight: "bold",
            paddingTop: "0.5rem",
          }}
        >
          素材库分组名称：
        </label>
        <TextField
          value={title}
          onChange={(val) => setTitle(val)}
          placeholder="素材库命名..."
        />

        <div style={{ marginTop: "1rem", maxHeight: "40vh", overflowY: "auto" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))",
            gridGap: "1rem"
          }}>
            <LibraryMenuSection
              itemsRenderedPerBatch={17}
              items={items}
              onItemSelectToggle={() => {}}
              onItemDrag={() => {}}
              onClick={() => {}}
              isItemSelected={() => false}
              svgCache={svgCache}
            />
          </div>
        </div>

        <div
          className="library-import-dialog__actions"
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "1.5rem",
            marginTop: "2rem",
            whiteSpace: "nowrap",
          }}
        >
          <Button
            onSelect={onConfirm}
            type="button"
            style={{ 
              whiteSpace: "nowrap", 
              minWidth: "120px", 
              padding: "0.6rem 2rem", 
              backgroundColor: "var(--color-primary)", 
              color: "white",
              fontSize: "1rem",
            }}
          >
            导入
          </Button>
          <Button 
            onSelect={onClose} 
            type="button" 
            style={{ 
              whiteSpace: "nowrap", 
              minWidth: "120px", 
              padding: "0.6rem 2rem",
              fontSize: "1rem",
            }}
          >
            {t("buttons.cancel")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
