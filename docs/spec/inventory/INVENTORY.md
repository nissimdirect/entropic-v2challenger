# INVENTORY (generated — do not hand-edit)

Source: `2d52d82` · regenerate: `node docs/spec/tools/inventory.mjs` · full data: `inventory.json`

## Counts

| metric | n |
|---|---|
| sourceFiles | 266 |
| components | 157 |
| orphanComponents | 7 |
| stores | 23 |
| storeActions | 377 |
| unreferencedActions | 59 |
| registryHotkeys | 51 |
| registeredHandlers | 47 |
| hotkeyConflicts | 0 |
| rawKeyHandlers | 30 |
| menuItems | 63 |
| menuUnhandled | 0 |
| dialogs | 15 |
| dragSources | 9 |
| dropTargets | 6 |
| pointerDragCandidates | 18 |
| dndPayloadSites | 31 |
| contextMenus | 40 |
| emptyStates | 20 |
| doubleClickSites | 22 |
| modifierChecks | 54 |
| panels | 22 |
| featureFlags | 2 |
| testids | 284 |
| planningDocs | 205 |
| docsWithStaleCites | 94 |
| citesNotInRepo | 489 |
| citesPlannedNotInRepo | 294 |
| citesRuntimePaths | 123 |
| citesMovedFile | 59 |
| citesLineBeyondEOF | 0 |
| docTestidsMissingInCode | 9 |

## Hotkeys — registry (`default-shortcuts.ts`)

| action | keys | context | category | handler bound | at |
|---|---|---|---|---|---|
| play_pause | space | normal | transport | yes | frontend/src/renderer/utils/default-shortcuts.ts:9 |
| transport_forward | l | normal | transport | yes | frontend/src/renderer/utils/default-shortcuts.ts:10 |
| transport_stop | k | normal | transport | yes | frontend/src/renderer/utils/default-shortcuts.ts:11 |
| transport_reverse | j | normal | transport | yes | frontend/src/renderer/utils/default-shortcuts.ts:12 |
| undo | meta+z | normal | edit | yes | frontend/src/renderer/utils/default-shortcuts.ts:15 |
| redo | meta+shift+z | normal | edit | yes | frontend/src/renderer/utils/default-shortcuts.ts:16 |
| duplicate_effect | meta+d | normal | edit | yes | frontend/src/renderer/utils/default-shortcuts.ts:17 |
| delete_selected | backspace | normal | edit | yes | frontend/src/renderer/utils/default-shortcuts.ts:18 |
| ripple_delete | shift+backspace | normal | edit | yes | frontend/src/renderer/utils/default-shortcuts.ts:20 |
| add_marker | m | normal | timeline | yes | frontend/src/renderer/utils/default-shortcuts.ts:25 |
| loop_in | i | normal | timeline | yes | frontend/src/renderer/utils/default-shortcuts.ts:26 |
| loop_out | o | normal | timeline | yes | frontend/src/renderer/utils/default-shortcuts.ts:27 |
| toggle_automation | a | normal | view | yes | frontend/src/renderer/utils/default-shortcuts.ts:30 |
| toggle_sidebar | meta+b | normal | view | yes | frontend/src/renderer/utils/default-shortcuts.ts:31 |
| toggle_focus | f | normal | view | yes | frontend/src/renderer/utils/default-shortcuts.ts:32 |
| zoom_in | meta+= | normal | view | yes | frontend/src/renderer/utils/default-shortcuts.ts:33 |
| zoom_out | meta+- | normal | view | yes | frontend/src/renderer/utils/default-shortcuts.ts:34 |
| zoom_fit | meta+0 | normal | view | yes | frontend/src/renderer/utils/default-shortcuts.ts:35 |
| toggle_quantize | meta+u | normal | view | yes | frontend/src/renderer/utils/default-shortcuts.ts:36 |
| split_at_playhead | meta+k | normal | timeline | yes | frontend/src/renderer/utils/default-shortcuts.ts:41 |
| automation_copy | meta+shift+c | normal | automation | yes | frontend/src/renderer/utils/default-shortcuts.ts:44 |
| automation_paste | meta+shift+v | normal | automation | yes | frontend/src/renderer/utils/default-shortcuts.ts:45 |
| save | meta+s | normal | project | yes | frontend/src/renderer/utils/default-shortcuts.ts:48 |
| open | meta+o | normal | project | yes | frontend/src/renderer/utils/default-shortcuts.ts:49 |
| new_project | meta+n | normal | project | yes | frontend/src/renderer/utils/default-shortcuts.ts:50 |
| export | meta+e | normal | project | yes | frontend/src/renderer/utils/default-shortcuts.ts:51 |
| toggle_perform | p | normal | project | yes | frontend/src/renderer/utils/default-shortcuts.ts:52 |
| toggle_operators | meta+shift+o | normal | project | yes | frontend/src/renderer/utils/default-shortcuts.ts:53 |
| feedback_dialog | meta+shift+f | normal | project | yes | frontend/src/renderer/utils/default-shortcuts.ts:54 |
| support_bundle | meta+shift+d | normal | project | yes | frontend/src/renderer/utils/default-shortcuts.ts:55 |
| import_media | meta+i | normal | project | yes | frontend/src/renderer/utils/default-shortcuts.ts:56 |
| add_text_track | meta+t | normal | project | yes | frontend/src/renderer/utils/default-shortcuts.ts:57 |
| routing_canvas | meta+shift+i | normal | project | yes | frontend/src/renderer/utils/default-shortcuts.ts:58 |
| tool_select | v | normal | tool | yes | frontend/src/renderer/utils/default-shortcuts.ts:67 |
| tool_razor | b | normal | tool | yes | frontend/src/renderer/utils/default-shortcuts.ts:72 |
| tool_slip | s | normal | tool | **NO** | frontend/src/renderer/utils/default-shortcuts.ts:73 |
| tool_slide | d | normal | tool | **NO** | frontend/src/renderer/utils/default-shortcuts.ts:74 |
| tool_ripple_delete | x | normal | tool | yes | frontend/src/renderer/utils/default-shortcuts.ts:75 |
| tool_marker | shift+m | normal | tool | yes | frontend/src/renderer/utils/default-shortcuts.ts:78 |
| tool_key | e | normal | mask | yes | frontend/src/renderer/utils/default-shortcuts.ts:82 |
| copy_selection_to_loop | meta+l | normal | timeline | yes | frontend/src/renderer/utils/default-shortcuts.ts:89 |
| grid_up | ] | normal | view | **NO** | frontend/src/renderer/utils/default-shortcuts.ts:90 |
| grid_down | [ | normal | view | **NO** | frontend/src/renderer/utils/default-shortcuts.ts:91 |
| toggle_popout | meta+shift+p | normal | view | **NO** | frontend/src/renderer/utils/default-shortcuts.ts:92 |
| tool_escape_select | escape | normal | tool | **NO** | frontend/src/renderer/utils/default-shortcuts.ts:93 |
| tool_marquee | q | normal | mask | yes | frontend/src/renderer/utils/default-shortcuts.ts:97 |
| tool_lasso | w | normal | mask | yes | frontend/src/renderer/utils/default-shortcuts.ts:100 |
| mask_delete_outside | alt+backspace | normal | mask | yes | frontend/src/renderer/utils/default-shortcuts.ts:101 |
| mask_deselect_all | meta+shift+a | normal | mask | yes | frontend/src/renderer/utils/default-shortcuts.ts:102 |
| mask_copy_to_track | meta+j | normal | mask | yes | frontend/src/renderer/utils/default-shortcuts.ts:106 |
| mask_cut_to_track | meta+shift+j | normal | mask | yes | frontend/src/renderer/utils/default-shortcuts.ts:107 |

### Registry conflicts (same keys + context)

| keys@context | actions |
|---|---|

### Handlers registered for actions not in the registry

| action | at |
|---|---|
| preferences | frontend/src/renderer/App.tsx:787 |
| about | frontend/src/renderer/App.tsx:788 |

### Raw key handlers outside the registry (shadow hotkeys)

| at | kind | component | keys tested |
|---|---|---|---|
| frontend/src/renderer/App.tsx:1194 | addEventListener(keydown) on window | AppInner | code:Escape code:Space key:Delete |
| frontend/src/renderer/App.tsx:1195 | addEventListener(keyup) on window | AppInner |  |
| frontend/src/renderer/components/automation/AutomationLane.tsx:378 | addEventListener(keydown) on window | AutomationLane | key:Escape |
| frontend/src/renderer/components/automation/AutomationNode.tsx:241 | JSX onKeyDown | AutomationNode | key:Backspace key:Delete |
| frontend/src/renderer/components/automation/AutomationTransformBox.tsx:261 | addEventListener(keydown) on window | AutomationTransformBox | key:Escape |
| frontend/src/renderer/components/common/Knob.tsx:225 | JSX onKeyDown | Knob | key:ArrowDown key:ArrowLeft key:ArrowRight key:ArrowUp |
| frontend/src/renderer/components/common/NumberInput.tsx:54 | JSX onKeyDown | NumberInput | key:Enter key:Escape |
| frontend/src/renderer/components/common/Slider.tsx:170 | JSX onKeyDown | Slider | key:ArrowDown key:ArrowLeft key:ArrowRight key:ArrowUp |
| frontend/src/renderer/components/demos/DemosDrawer.tsx:109 | JSX onKeyDown | DemoCard | key:  key:Enter |
| frontend/src/renderer/components/demos/DemosDrawer.tsx:189 | addEventListener(keydown) on document | DemosDrawer | key:Escape |
| frontend/src/renderer/components/effects/EffectBrowser.tsx:497 | JSX onKeyDown | EffectBrowser | key:Escape |
| frontend/src/renderer/components/effects/ParamPanel.tsx:204 | JSX onKeyDown | ParamPanel | key:Tab |
| frontend/src/renderer/components/inline-actions/InlineActionMenu.tsx:111 | addEventListener(keydown) on document | InlineActionMenu | key:ArrowDown key:ArrowUp key:Enter key:Escape |
| frontend/src/renderer/components/layout/ShortcutEditor.tsx:53 | addEventListener(keydown) on window | ShortcutEditor | key:Escape |
| frontend/src/renderer/components/layout/ToolRail.tsx:152 | addEventListener(keydown) on document | ToolFlyout | key:Escape |
| frontend/src/renderer/components/layout/ToolRail.tsx:204 | JSX onKeyDown | ToolFlyout | key:ArrowDown key:ArrowUp |
| frontend/src/renderer/components/preview/BoundingBoxOverlay.tsx:209 | addEventListener(keydown) on window | BoundingBoxOverlay | key:ArrowDown key:ArrowLeft key:ArrowRight key:ArrowUp |
| frontend/src/renderer/components/preview/MaskSelectOverlay.tsx:445 | addEventListener(keydown) on window | MaskSelectOverlay | code:Enter code:Escape |
| frontend/src/renderer/components/routing-canvas/RoutingCanvas.tsx:244 | addEventListener(keydown) on window | RoutingCanvas | key:Escape |
| frontend/src/renderer/components/text/TextOverlay.tsx:135 | JSX onKeyDown | TextOverlay | key:Enter key:Escape |
| frontend/src/renderer/components/timeline/Clip.tsx:729 | JSX onKeyDown | ClipComponent | key:Enter key:Escape |
| frontend/src/renderer/components/timeline/ContextMenu.tsx:100 | addEventListener(keydown) on document | ContextMenu | key:Escape |
| frontend/src/renderer/components/timeline/ContextMenu.tsx:157 | JSX onKeyDown | ContextMenu | key:ArrowDown key:ArrowUp key:End key:Home |
| frontend/src/renderer/components/timeline/MarkerFlag.tsx:90 | JSX onKeyDown | MarkerFlag | key:Enter key:Escape |
| frontend/src/renderer/components/timeline/SpeedDialog.tsx:69 | JSX onKeyDown | SpeedDialog | key:Enter key:Escape |
| frontend/src/renderer/components/timeline/Timeline.tsx:114 | addEventListener(keydown) on window | Timeline | key:Escape |
| frontend/src/renderer/components/timeline/Track.tsx:544 | JSX onKeyDown | TrackHeader | key:Enter key:Escape |
| frontend/src/renderer/components/timeline/UnifiedTrackHeader.tsx:261 | JSX onKeyDown | UnifiedTrackHeader |  |
| frontend/src/renderer/hooks/useHoverDelegation.ts:123 | addEventListener(keydown) on document | (module) | key:Escape |
| frontend/src/renderer/hooks/useModalBehavior.ts:139 | addEventListener(keydown) on el | (module) | key:Escape key:Tab |

## Menu commands (`main/menu.ts`)

| menu | label | accelerator | action | renderer handles | at |
|---|---|---|---|---|---|
| File | New Project | CmdOrCtrl+N | new-project | yes | frontend/src/main/menu.ts:26 |
| File | Open Project... | CmdOrCtrl+O | open-project | yes | frontend/src/main/menu.ts:27 |
| File | Import Media... | CmdOrCtrl+I | import-media | yes | frontend/src/main/menu.ts:29 |
| File | Add Text Track | CmdOrCtrl+T | add-text-track | yes | frontend/src/main/menu.ts:30 |
| File | Save | CmdOrCtrl+S | save | yes | frontend/src/main/menu.ts:32 |
| File | Save As... | CmdOrCtrl+Shift+S | save-as | yes | frontend/src/main/menu.ts:33 |
| File | Export... | CmdOrCtrl+E | export | yes | frontend/src/main/menu.ts:35 |
| File | Export Current Frame… |  | export-current-frame | yes | frontend/src/main/menu.ts:36 |
| Edit |  |  | role:undo |  | frontend/src/main/menu.ts:43 |
| Edit |  |  | role:redo |  | frontend/src/main/menu.ts:44 |
| Edit | Undo History |  | show-history | yes | frontend/src/main/menu.ts:48 |
| Edit |  |  | role:cut |  | frontend/src/main/menu.ts:50 |
| Edit |  |  | role:copy |  | frontend/src/main/menu.ts:51 |
| Edit |  |  | role:paste |  | frontend/src/main/menu.ts:52 |
| Edit |  |  |  |  | frontend/src/main/menu.ts:53 |
| Edit |  |  | role:delete |  | frontend/src/main/menu.ts:54 |
| Select | Select All Clips | CmdOrCtrl+A | select-all-clips | yes | frontend/src/main/menu.ts:61 |
| Select | Deselect All |  | deselect-all | yes | frontend/src/main/menu.ts:62 |
| Select | Invert Selection |  | invert-selection | yes | frontend/src/main/menu.ts:63 |
| Select | Select Clips on Track |  | select-by-track | yes | frontend/src/main/menu.ts:65 |
| Clip | Split at Playhead | CmdOrCtrl+K | split-at-playhead | yes | frontend/src/main/menu.ts:72 |
| Clip | Speed/Duration... |  | clip-speed | yes | frontend/src/main/menu.ts:74 |
| Clip | Reverse |  | clip-reverse | yes | frontend/src/main/menu.ts:75 |
| Clip | Enable/Disable |  | clip-toggle-enabled | yes | frontend/src/main/menu.ts:77 |
| Timeline | Add Video Track |  | add-video-track | yes | frontend/src/main/menu.ts:84 |
| Timeline | Add Text Track | CmdOrCtrl+T | add-text-track | yes | frontend/src/main/menu.ts:85 |
| Timeline | Delete Selected Track |  | delete-selected-track | yes | frontend/src/main/menu.ts:87 |
| Timeline | Move Track Up |  | move-track-up | yes | frontend/src/main/menu.ts:89 |
| Timeline | Move Track Down |  | move-track-down | yes | frontend/src/main/menu.ts:90 |
| Adjustments | Curves |  | add-effect:util.curves | yes | frontend/src/main/menu.ts:97 |
| Adjustments | Levels |  | add-effect:util.levels | yes | frontend/src/main/menu.ts:98 |
| Adjustments | Auto Levels |  | add-effect:util.auto_levels | yes | frontend/src/main/menu.ts:99 |
| Adjustments | HSL Adjust |  | add-effect:util.hsl_adjust | yes | frontend/src/main/menu.ts:101 |
| Adjustments | Color Balance |  | add-effect:util.color_balance | yes | frontend/src/main/menu.ts:102 |
| Adjustments | Color Temperature |  | add-effect:fx.color_temperature | yes | frontend/src/main/menu.ts:103 |
| Adjustments | Brightness / Exposure |  | add-effect:fx.brightness_exposure | yes | frontend/src/main/menu.ts:105 |
| Adjustments | Contrast Crush |  | add-effect:fx.contrast_crush | yes | frontend/src/main/menu.ts:106 |
| Adjustments | Saturation Warp |  | add-effect:fx.saturation_warp | yes | frontend/src/main/menu.ts:107 |
| Adjustments | Color Invert |  | add-effect:fx.color_invert | yes | frontend/src/main/menu.ts:109 |
| Adjustments | Color Filter |  | add-effect:fx.color_filter | yes | frontend/src/main/menu.ts:110 |
| Adjustments | Posterize |  | add-effect:fx.posterize | yes | frontend/src/main/menu.ts:111 |
| Adjustments | Duotone |  | add-effect:fx.duotone | yes | frontend/src/main/menu.ts:112 |
| Adjustments | False Color |  | add-effect:fx.false_color | yes | frontend/src/main/menu.ts:113 |
| Adjustments | Cyanotype |  | add-effect:fx.cyanotype | yes | frontend/src/main/menu.ts:115 |
| Adjustments | Infrared |  | add-effect:fx.infrared | yes | frontend/src/main/menu.ts:116 |
| Adjustments | Tape Saturation |  | add-effect:fx.tape_saturation | yes | frontend/src/main/menu.ts:117 |
| View | Toggle Sidebar | CmdOrCtrl+B | toggle-sidebar | yes | frontend/src/main/menu.ts:124 |
| View | Toggle Focus Mode | F | toggle-focus | yes | frontend/src/main/menu.ts:125 |
| View | Toggle Automation | A | toggle-automation | yes | frontend/src/main/menu.ts:126 |
| View | Zoom In | CmdOrCtrl+= | zoom-in | yes | frontend/src/main/menu.ts:128 |
| View | Zoom Out | CmdOrCtrl+- | zoom-out | yes | frontend/src/main/menu.ts:129 |
| View | Zoom to Fit | CmdOrCtrl+0 | zoom-fit | yes | frontend/src/main/menu.ts:130 |
| View | Toggle Quantize | CmdOrCtrl+U | toggle-quantize | yes | frontend/src/main/menu.ts:132 |
| Help | Keyboard Shortcuts |  | show-shortcuts | yes | frontend/src/main/menu.ts:139 |
| Help | Send Feedback | CmdOrCtrl+Shift+F | show-feedback | yes | frontend/src/main/menu.ts:140 |
| Help | Generate Support Bundle | CmdOrCtrl+Shift+D | support-bundle | yes | frontend/src/main/menu.ts:141 |
| Creatrix | About Creatrix |  | about | yes | frontend/src/main/menu.ts:148 |
| Creatrix |  |  | role:services |  | frontend/src/main/menu.ts:150 |
| Creatrix | Hide Creatrix |  | role:hide |  | frontend/src/main/menu.ts:152 |
| Creatrix |  |  | role:hideOthers |  | frontend/src/main/menu.ts:153 |
| Creatrix |  |  | role:unhide |  | frontend/src/main/menu.ts:154 |
| Creatrix | Quit Creatrix |  | role:quit |  | frontend/src/main/menu.ts:156 |
|  |  |  |  |  | frontend/src/main/menu.ts:169 |

### Menu accelerator ↔ registry audit

| menu item | accelerator | menu action | registry action on same keys | at |
|---|---|---|---|---|
| File › New Project | CmdOrCtrl+N | new-project | new_project | frontend/src/main/menu.ts:26 |
| File › Open Project... | CmdOrCtrl+O | open-project | open | frontend/src/main/menu.ts:27 |
| File › Import Media... | CmdOrCtrl+I | import-media | import_media | frontend/src/main/menu.ts:29 |
| File › Add Text Track | CmdOrCtrl+T | add-text-track | add_text_track | frontend/src/main/menu.ts:30 |
| File › Save | CmdOrCtrl+S | save | save | frontend/src/main/menu.ts:32 |
| File › Save As... | CmdOrCtrl+Shift+S | save-as | **none** | frontend/src/main/menu.ts:33 |
| File › Export... | CmdOrCtrl+E | export | export | frontend/src/main/menu.ts:35 |
| Select › Select All Clips | CmdOrCtrl+A | select-all-clips | **none** | frontend/src/main/menu.ts:61 |
| Clip › Split at Playhead | CmdOrCtrl+K | split-at-playhead | split_at_playhead | frontend/src/main/menu.ts:72 |
| Timeline › Add Text Track | CmdOrCtrl+T | add-text-track | add_text_track | frontend/src/main/menu.ts:85 |
| View › Toggle Sidebar | CmdOrCtrl+B | toggle-sidebar | toggle_sidebar | frontend/src/main/menu.ts:124 |
| View › Toggle Focus Mode | F | toggle-focus | toggle_focus | frontend/src/main/menu.ts:125 |
| View › Toggle Automation | A | toggle-automation | toggle_automation | frontend/src/main/menu.ts:126 |
| View › Zoom In | CmdOrCtrl+= | zoom-in | zoom_in | frontend/src/main/menu.ts:128 |
| View › Zoom Out | CmdOrCtrl+- | zoom-out | zoom_out | frontend/src/main/menu.ts:129 |
| View › Zoom to Fit | CmdOrCtrl+0 | zoom-fit | zoom_fit | frontend/src/main/menu.ts:130 |
| View › Toggle Quantize | CmdOrCtrl+U | toggle-quantize | toggle_quantize | frontend/src/main/menu.ts:132 |
| Help › Send Feedback | CmdOrCtrl+Shift+F | show-feedback | feedback_dialog | frontend/src/main/menu.ts:140 |
| Help › Generate Support Bundle | CmdOrCtrl+Shift+D | support-bundle | support_bundle | frontend/src/main/menu.ts:141 |

## Zustand stores

| store | file | state keys | actions | actions w/ no external ref |
|---|---|---|---|---|
| useAudioStore | frontend/src/renderer/stores/audio.ts | 13 | 13 |  |
| useAutomationStore | frontend/src/renderer/stores/automation.ts | 8 | 42 | clearAllSg3Aborts, removeLane, recordTriggerEvent, mergeCapturedTriggers, clearPointSelection, copySelectedPoints, getLanesForEffect |
| useBrowserStore | frontend/src/renderer/stores/browser.ts | 6 | 13 | addFolder, removeFolder, renameFolder, addToFolder, removeFromFolder, isCategoryCollapsed, setHoveredEffectId |
| useEffectsStore | frontend/src/renderer/stores/effects.ts | 3 | 1 |  |
| useEngineStore | frontend/src/renderer/stores/engine.ts | 3 | 1 |  |
| useExportStore | frontend/src/renderer/stores/export.ts | 3 | 7 | addJob, updateJobStatus, cancelCurrent |
| useFreezeStore | frontend/src/renderer/stores/freeze.ts | 2 | 6 | getFreezeInfo |
| useInstrumentsStore | frontend/src/renderer/stores/instruments.ts | 4 | 49 | getSampler, getFrameBank, reorderFrameBankSlot, removeRack, getRack, addRackPad, setRackPadSource, updateRackPad, getGranulator |
| useLayoutStore | frontend/src/renderer/stores/layout.ts | 17 | 18 | setPopOutBounds, setPreviewCollapsed |
| useLibraryStore | frontend/src/renderer/stores/library.ts | 5 | 7 |  |
| useMemoryPressureStore | frontend/src/renderer/stores/memoryPressure.ts | 0 | 2 |  |
| useMIDIStore | frontend/src/renderer/stores/midi.ts | 12 | 25 | addCCMapping, removeCCBankBinding, clearCCBankBindings, clearBankAssignment, setActiveBankIndex, addCCSlotMapping, removeCCSlotMapping, clearCCSlotMappings |
| useMIDIMapModeStore | frontend/src/renderer/stores/midiMapMode.ts | 2 | 3 |  |
| useOnboardingStore | frontend/src/renderer/stores/onboarding.ts | 5 | 8 | openDrawer, markTourSeen, isTourSeen |
| useOperatorStore | frontend/src/renderer/stores/operators.ts | 1 | 11 |  |
| usePerformanceStore | frontend/src/renderer/stores/performance.ts | 4 | 16 | forceOffPad |
| usePerformanceFreezeStore | frontend/src/renderer/stores/performanceFreeze.ts | 6 | 10 | setBakeFn, isFreezing, enqueueTrigger, cancelFreeze |
| useProjectStore | frontend/src/renderer/stores/project.ts | 4 | 35 | exitBranch |
| useSettingsStore | frontend/src/renderer/stores/settings.ts | 3 | 4 | loadPreferences, savePreferences |
| useTimelineStore | frontend/src/renderer/stores/timeline.ts | 0 | 92 | rippleTrimClipOut, moveMarker, setLooping, getActiveClipsAtTime, removeAudioClip, removeAudioClips, setClipGain, trimAudioClip, toggleAudioClipMute, getActiveAudioClipsAtTime |
| useToastStore | frontend/src/renderer/stores/toast.ts | 1 | 4 | clearAll |
| useTrackDragStore | frontend/src/renderer/stores/trackDrag.ts | 2 | 2 |  |
| useUndoStore | frontend/src/renderer/stores/undo.ts | 4 | 8 |  |

## Components

| component | at | exported | mounted in |
|---|---|---|---|
| CursorToolChip | frontend/src/renderer/App.tsx:225 |  | frontend/src/renderer/App.tsx |
| MapModeToggle | frontend/src/renderer/App.tsx:256 |  | frontend/src/renderer/App.tsx |
| SpeedDialogHost | frontend/src/renderer/App.tsx:273 |  | frontend/src/renderer/App.tsx |
| AppInner | frontend/src/renderer/App.tsx:357 |  | frontend/src/renderer/App.tsx |
| App | frontend/src/renderer/App.tsx:4537 | y | frontend/src/renderer/index.tsx |
| Icon | frontend/src/renderer/assets/icon-kit.tsx:382 | y | frontend/src/renderer/App.tsx, frontend/src/renderer/assets/icon-kit.tsx, frontend/src/renderer/components/automation/AutomationToolbar.tsx, frontend/src/renderer/components/demos/DemosDrawer.tsx, frontend/src/renderer/components/device-chain/DeviceCard.tsx, frontend/src/renderer/components/effects/EffectBrowser.tsx, frontend/src/renderer/components/inspector/InspectorHoverHelp.tsx, frontend/src/renderer/components/instruments/FrameBankDevice.tsx, frontend/src/renderer/components/instruments/RackDevice.tsx, frontend/src/renderer/components/layout/BankPagingHUD.tsx, frontend/src/renderer/components/library/PresetCard.tsx, frontend/src/renderer/components/masking/MaskStackPanel.tsx, frontend/src/renderer/components/operators/FusionEditor.tsx, frontend/src/renderer/components/operators/LFOEditor.tsx, frontend/src/renderer/components/operators/ModulationMatrix.tsx, frontend/src/renderer/components/operators/OperatorKentaroCluster.tsx, frontend/src/renderer/components/operators/OperatorRack.tsx, frontend/src/renderer/components/performance/MIDISettings.tsx, frontend/src/renderer/components/performance/PadEditor.tsx, frontend/src/renderer/components/performance/PerformancePanel.tsx, frontend/src/renderer/components/preview/PreviewCanvas.tsx, frontend/src/renderer/components/timeline/Clip.tsx, frontend/src/renderer/components/timeline/InspectorTrack.tsx, frontend/src/renderer/components/timeline/LayerPanel.tsx, frontend/src/renderer/components/timeline/Track.tsx, frontend/src/renderer/components/timeline/TransformPanel.tsx, frontend/src/renderer/components/timeline/UnifiedTrackHeader.tsx, frontend/src/renderer/components/transport/VolumeControl.tsx |
| CloseButton | frontend/src/renderer/assets/icon-kit.tsx:415 | y | frontend/src/renderer/App.tsx, frontend/src/renderer/components/demos/DemosDrawer.tsx, frontend/src/renderer/components/layout/UpdateBanner.tsx, frontend/src/renderer/components/operators/B9EdgeInspector.tsx, frontend/src/renderer/components/performance/PadEditor.tsx, frontend/src/renderer/components/routing-canvas/RoutingCanvas.tsx |
| MaskCountBadge | frontend/src/renderer/assets/icon-kit.tsx:450 | y | frontend/src/renderer/components/timeline/Clip.tsx |
| ToolIcon | frontend/src/renderer/assets/tool-icons.tsx:267 | y | frontend/src/renderer/components/effects/EffectBrowser.tsx, frontend/src/renderer/components/layout/ToolRail.tsx |
| TransportIcon | frontend/src/renderer/assets/transport-icons.tsx:49 | y | frontend/src/renderer/App.tsx |
| GainMeter | frontend/src/renderer/components/audio/GainMeter.tsx:51 | y | frontend/src/renderer/components/timeline/AudioTrack.tsx |
| AutomationDraw | frontend/src/renderer/components/automation/AutomationDraw.tsx:20 | y | frontend/src/renderer/components/timeline/MasterTrack.tsx, frontend/src/renderer/components/timeline/Track.tsx |
| AutomationLane | frontend/src/renderer/components/automation/AutomationLane.tsx:109 | y | frontend/src/renderer/components/device-chain/DeviceCard.tsx, frontend/src/renderer/components/effects/ParamPanel.tsx, frontend/src/renderer/components/performance/applyProjectModulations.ts, frontend/src/renderer/components/routing-canvas/routing-graph-ipc.ts, frontend/src/renderer/project-persistence.ts, frontend/src/renderer/stores/automation.ts, frontend/src/renderer/stores/crossStoreCleanup.ts, frontend/src/renderer/stores/timeline.ts, frontend/src/renderer/utils/automation-evaluate.ts, frontend/src/renderer/utils/evaluateAutomationOverrides.ts, frontend/src/renderer/utils/operatorLaneSpecs.ts, frontend/src/renderer/utils/transformLanes.ts, frontend/src/shared/axis-lanes.ts |
| TriggerBlocks | frontend/src/renderer/components/automation/AutomationLane.tsx:61 |  | frontend/src/renderer/components/automation/AutomationLane.tsx |
| AutomationNode | frontend/src/renderer/components/automation/AutomationNode.tsx:60 | y | frontend/src/renderer/components/automation/AutomationLane.tsx |
| AutomationToolbar | frontend/src/renderer/components/automation/AutomationToolbar.tsx:88 | y | frontend/src/renderer/App.tsx |
| AutomationTransformBox | frontend/src/renderer/components/automation/AutomationTransformBox.tsx:62 | y | frontend/src/renderer/components/automation/AutomationLane.tsx |
| CurveSegment | frontend/src/renderer/components/automation/CurveSegment.tsx:16 | y | frontend/src/renderer/components/automation/AutomationLane.tsx |
| EmptyState | frontend/src/renderer/components/common/EmptyState.tsx:26 | y | frontend/src/renderer/components/device-chain/DeviceChain.tsx, frontend/src/renderer/components/effects/EffectBrowser.tsx, frontend/src/renderer/components/effects/HelpPanel.tsx, frontend/src/renderer/components/export/RenderQueue.tsx, frontend/src/renderer/components/layout/HistoryPanel.tsx, frontend/src/renderer/components/library/PresetBrowser.tsx, frontend/src/renderer/components/masking/MaskStackPanel.tsx, frontend/src/renderer/components/operators/OperatorRack.tsx, frontend/src/renderer/components/performance/MIDISettings.tsx, frontend/src/renderer/components/preview/PreviewCanvas.tsx, frontend/src/renderer/components/routing-canvas/NodeColumn.tsx, frontend/src/renderer/components/timeline/InspectorTrack.tsx, frontend/src/renderer/components/timeline/LayerPanel.tsx |
| Knob | frontend/src/renderer/components/common/Knob.tsx:81 | y | frontend/src/renderer/components/device-chain/DeviceCard.tsx, frontend/src/renderer/components/effects/ParamPanel.tsx, frontend/src/renderer/components/timeline/AudioTrack.tsx |
| NumberInput | frontend/src/renderer/components/common/NumberInput.tsx:18 | y | frontend/src/renderer/components/common/Knob.tsx, frontend/src/renderer/components/common/Slider.tsx |
| ParamLabel | frontend/src/renderer/components/common/ParamLabel.tsx:17 | y | frontend/src/renderer/components/common/Knob.tsx |
| ParamTooltip | frontend/src/renderer/components/common/ParamTooltip.tsx:19 | y | frontend/src/renderer/components/common/Knob.tsx |
| Select | frontend/src/renderer/components/common/Select.tsx:29 | y | frontend/src/renderer/App.tsx, frontend/src/renderer/components/automation/AutomationLane.tsx, frontend/src/renderer/components/automation/AutomationToolbar.tsx, frontend/src/renderer/components/device-chain/DeviceCard.tsx, frontend/src/renderer/components/dialogs/ExportDialog.tsx, frontend/src/renderer/components/effects/ParamChoice.tsx, frontend/src/renderer/components/instruments/FrameBankDevice.tsx, frontend/src/renderer/components/instruments/GranulatorDevice.tsx, frontend/src/renderer/components/instruments/RackDevice.tsx, frontend/src/renderer/components/instruments/SamplerDevice.tsx, frontend/src/renderer/components/layout/Preferences.tsx, frontend/src/renderer/components/library/PresetSaveDialog.tsx, frontend/src/renderer/components/masking/MaskStackPanel.tsx, frontend/src/renderer/components/operators/AudioFollowerEditor.tsx, frontend/src/renderer/components/operators/B9EdgeInspector.tsx, frontend/src/renderer/components/operators/FusionEditor.tsx, frontend/src/renderer/components/operators/LFOEditor.tsx, frontend/src/renderer/components/operators/OperatorKentaroCluster.tsx, frontend/src/renderer/components/operators/VideoAnalyzerEditor.tsx, frontend/src/renderer/components/performance/MIDISettings.tsx, frontend/src/renderer/components/performance/PadEditor.tsx, frontend/src/renderer/components/text/TextPanel.tsx, frontend/src/renderer/components/timeline/Track.tsx |
| Slider | frontend/src/renderer/components/common/Slider.tsx:48 | y | frontend/src/renderer/components/device-chain/DeviceCard.tsx, frontend/src/renderer/components/dialogs/ExportDialog.tsx, frontend/src/renderer/components/effects/EffectBrowser.tsx, frontend/src/renderer/components/effects/ParamMix.tsx, frontend/src/renderer/components/effects/ParamSlider.tsx, frontend/src/renderer/components/instruments/FrameBankDevice.tsx, frontend/src/renderer/components/instruments/GranulatorDevice.tsx, frontend/src/renderer/components/instruments/RackDevice.tsx, frontend/src/renderer/components/instruments/SamplerDevice.tsx, frontend/src/renderer/components/library/MacroKnob.tsx, frontend/src/renderer/components/masking/MaskStackPanel.tsx, frontend/src/renderer/components/operators/FusionEditor.tsx, frontend/src/renderer/components/operators/ModulationMatrix.tsx, frontend/src/renderer/components/operators/OperatorKentaroCluster.tsx, frontend/src/renderer/components/performance/PadEditor.tsx, frontend/src/renderer/components/routing-canvas/EdgeInspector.tsx, frontend/src/renderer/components/text/TextPanel.tsx, frontend/src/renderer/components/timeline/LayerPanel.tsx, frontend/src/renderer/components/timeline/Track.tsx, frontend/src/renderer/components/timeline/TransformPanel.tsx, frontend/src/renderer/components/timeline/ZoomScroll.tsx, frontend/src/renderer/components/transport/VolumeControl.tsx |
| Toast | frontend/src/renderer/components/common/Toast.tsx:5 | y | frontend/src/renderer/App.tsx |
| Tooltip | frontend/src/renderer/components/common/Tooltip.tsx:18 | y | frontend/src/renderer/App.tsx, frontend/src/renderer/components/effects/EffectCard.tsx, frontend/src/renderer/components/effects/EffectRack.tsx |
| BootLine | frontend/src/renderer/components/demos/BootLine.tsx:40 | y | frontend/src/renderer/App.tsx |
| DemosDrawer | frontend/src/renderer/components/demos/DemosDrawer.tsx:177 | y | frontend/src/renderer/App.tsx |
| DemoCard | frontend/src/renderer/components/demos/DemosDrawer.tsx:57 |  | frontend/src/renderer/components/demos/DemosDrawer.tsx |
| ABSwitch | frontend/src/renderer/components/device-chain/ABSwitch.tsx:9 | y | frontend/src/renderer/components/device-chain/DeviceCard.tsx |
| DeviceCard | frontend/src/renderer/components/device-chain/DeviceCard.tsx:60 | y | frontend/src/renderer/components/device-chain/DeviceChain.tsx |
| DeviceChain | frontend/src/renderer/components/device-chain/DeviceChain.tsx:38 | y | frontend/src/renderer/App.tsx |
| CrashRecoveryDialog | frontend/src/renderer/components/dialogs/CrashRecoveryDialog.tsx:13 | y | frontend/src/renderer/App.tsx |
| ExportDialog | frontend/src/renderer/components/dialogs/ExportDialog.tsx:100 | y | frontend/src/renderer/App.tsx |
| FeedbackDialog | frontend/src/renderer/components/dialogs/FeedbackDialog.tsx:9 | y | frontend/src/renderer/App.tsx |
| RelinkDialog | frontend/src/renderer/components/dialogs/RelinkDialog.tsx:52 | y | frontend/src/renderer/App.tsx |
| TelemetryConsentDialog | frontend/src/renderer/components/dialogs/TelemetryConsentDialog.tsx:9 | y | frontend/src/renderer/App.tsx |
| UnsavedChangesDialog | frontend/src/renderer/components/dialogs/UnsavedChangesDialog.tsx:37 | y | frontend/src/renderer/App.tsx |
| EffectBrowser | frontend/src/renderer/components/effects/EffectBrowser.tsx:253 | y | frontend/src/renderer/App.tsx |
| EffectCard | frontend/src/renderer/components/effects/EffectCard.tsx:13 | y | frontend/src/renderer/components/effects/EffectRack.tsx |
| EffectRack | frontend/src/renderer/components/effects/EffectRack.tsx:28 | y | **orphan** |
| EffectSearch | frontend/src/renderer/components/effects/EffectSearch.tsx:6 | y | **orphan** |
| FreezeOverlay | frontend/src/renderer/components/effects/FreezeOverlay.tsx:5 | y | frontend/src/renderer/components/effects/EffectRack.tsx |
| HelpPanel | frontend/src/renderer/components/effects/HelpPanel.tsx:5 | y | frontend/src/renderer/App.tsx |
| ParamChoice | frontend/src/renderer/components/effects/ParamChoice.tsx:11 | y | frontend/src/renderer/components/device-chain/DeviceCard.tsx, frontend/src/renderer/components/effects/ParamPanel.tsx |
| ParamMix | frontend/src/renderer/components/effects/ParamMix.tsx:8 | y | frontend/src/renderer/components/effects/ParamPanel.tsx |
| ParamPanel | frontend/src/renderer/components/effects/ParamPanel.tsx:28 | y | **orphan** |
| ParamSlider | frontend/src/renderer/components/effects/ParamSlider.tsx:22 | y | **orphan** |
| ParamToggle | frontend/src/renderer/components/effects/ParamToggle.tsx:10 | y | frontend/src/renderer/components/device-chain/DeviceCard.tsx, frontend/src/renderer/components/effects/ParamPanel.tsx |
| ExportProgress | frontend/src/renderer/components/export/ExportProgress.tsx:49 | y | frontend/src/renderer/App.tsx |
| RenderQueue | frontend/src/renderer/components/export/RenderQueue.tsx:37 | y | frontend/src/renderer/App.tsx |
| InlineActionMenu | frontend/src/renderer/components/inline-actions/InlineActionMenu.tsx:44 | y | frontend/src/renderer/components/inspector/InspectorEffectState.tsx |
| InspectorBody | frontend/src/renderer/components/inspector/Inspector.tsx:68 |  | frontend/src/renderer/components/inspector/Inspector.tsx |
| Inspector | frontend/src/renderer/components/inspector/Inspector.tsx:92 | y | frontend/src/renderer/App.tsx |
| InspectorClipState | frontend/src/renderer/components/inspector/InspectorClipState.tsx:21 | y | frontend/src/renderer/components/inspector/Inspector.tsx |
| ParamProbeRow | frontend/src/renderer/components/inspector/InspectorEffectState.tsx:34 |  | frontend/src/renderer/components/inspector/InspectorEffectState.tsx |
| InspectorEffectState | frontend/src/renderer/components/inspector/InspectorEffectState.tsx:96 | y | frontend/src/renderer/components/inspector/Inspector.tsx |
| InspectorHoverHelp | frontend/src/renderer/components/inspector/InspectorHoverHelp.tsx:32 | y | frontend/src/renderer/components/inspector/Inspector.tsx |
| InspectorMarkerState | frontend/src/renderer/components/inspector/InspectorMarkerState.tsx:13 | y | frontend/src/renderer/components/inspector/Inspector.tsx |
| InspectorMultiState | frontend/src/renderer/components/inspector/InspectorMultiState.tsx:11 | y | frontend/src/renderer/components/inspector/Inspector.tsx |
| InspectorNoneState | frontend/src/renderer/components/inspector/InspectorNoneState.tsx:7 | y | frontend/src/renderer/components/inspector/Inspector.tsx |
| InspectorOperatorState | frontend/src/renderer/components/inspector/InspectorOperatorState.tsx:14 | y | frontend/src/renderer/components/inspector/Inspector.tsx |
| InspectorToolState | frontend/src/renderer/components/inspector/InspectorToolState.tsx:13 | y | frontend/src/renderer/components/inspector/Inspector.tsx |
| InspectorTrackState | frontend/src/renderer/components/inspector/InspectorTrackState.tsx:13 | y | frontend/src/renderer/components/inspector/Inspector.tsx |
| FrameBankDevice | frontend/src/renderer/components/instruments/FrameBankDevice.tsx:70 | y | frontend/src/renderer/App.tsx |
| GranulatorDevice | frontend/src/renderer/components/instruments/GranulatorDevice.tsx:205 | y | frontend/src/renderer/App.tsx |
| InstrumentsBrowser | frontend/src/renderer/components/instruments/InstrumentsBrowser.tsx:56 | y | frontend/src/renderer/App.tsx, frontend/src/renderer/components/effects/EffectBrowser.tsx |
| MacroRow | frontend/src/renderer/components/instruments/RackDevice.tsx:577 |  | frontend/src/renderer/components/instruments/RackDevice.tsx |
| RackDevice | frontend/src/renderer/components/instruments/RackDevice.tsx:59 | y | frontend/src/renderer/App.tsx |
| SamplerDevice | frontend/src/renderer/components/instruments/SamplerDevice.tsx:28 | y | frontend/src/renderer/App.tsx |
| AboutDialog | frontend/src/renderer/components/layout/AboutDialog.tsx:10 | y | frontend/src/renderer/App.tsx |
| BankPagingHUD | frontend/src/renderer/components/layout/BankPagingHUD.tsx:25 | y | frontend/src/renderer/App.tsx |
| HistoryPanel | frontend/src/renderer/components/layout/HistoryPanel.tsx:5 | y | frontend/src/renderer/App.tsx |
| MappingContextChip | frontend/src/renderer/components/layout/MappingContextChip.tsx:18 | y | frontend/src/renderer/App.tsx |
| Preferences | frontend/src/renderer/components/layout/Preferences.tsx:25 | y | frontend/src/renderer/App.tsx |
| QuantizeReadout | frontend/src/renderer/components/layout/QuantizeReadout.tsx:14 | y | frontend/src/renderer/App.tsx |
| ShortcutEditor | frontend/src/renderer/components/layout/ShortcutEditor.tsx:9 | y | frontend/src/renderer/components/layout/Preferences.tsx |
| ToolFlyout | frontend/src/renderer/components/layout/ToolRail.tsx:111 |  | frontend/src/renderer/components/layout/ToolRail.tsx |
| ToolRail | frontend/src/renderer/components/layout/ToolRail.tsx:234 | y | frontend/src/renderer/App.tsx |
| UpdateBanner | frontend/src/renderer/components/layout/UpdateBanner.tsx:10 | y | frontend/src/renderer/App.tsx |
| WelcomeScreen | frontend/src/renderer/components/layout/WelcomeScreen.tsx:24 | y | frontend/src/renderer/App.tsx |
| MacroKnob | frontend/src/renderer/components/library/MacroKnob.tsx:10 | y | **orphan** |
| PresetBrowser | frontend/src/renderer/components/library/PresetBrowser.tsx:13 | y | frontend/src/renderer/App.tsx |
| PresetCard | frontend/src/renderer/components/library/PresetCard.tsx:11 | y | frontend/src/renderer/components/library/PresetBrowser.tsx |
| PresetSaveDialog | frontend/src/renderer/components/library/PresetSaveDialog.tsx:18 | y | frontend/src/renderer/App.tsx |
| MaskStackPanel | frontend/src/renderer/components/masking/MaskStackPanel.tsx:257 | y | frontend/src/renderer/App.tsx |
| NodeCard | frontend/src/renderer/components/masking/MaskStackPanel.tsx:61 |  | frontend/src/renderer/components/masking/MaskStackPanel.tsx |
| AudioFollowerEditor | frontend/src/renderer/components/operators/AudioFollowerEditor.tsx:10 | y | frontend/src/renderer/components/operators/OperatorRack.tsx |
| B9EdgeInspector | frontend/src/renderer/components/operators/B9EdgeInspector.tsx:145 | y | frontend/src/renderer/components/operators/OperatorRack.tsx |
| DepthArc | frontend/src/renderer/components/operators/B9EdgeInspector.tsx:78 |  | frontend/src/renderer/components/operators/B9EdgeInspector.tsx |
| EnvelopeEditor | frontend/src/renderer/components/operators/EnvelopeEditor.tsx:8 | y | frontend/src/renderer/components/operators/OperatorRack.tsx |
| FusionEditor | frontend/src/renderer/components/operators/FusionEditor.tsx:20 | y | frontend/src/renderer/components/operators/OperatorRack.tsx |
| LFOEditor | frontend/src/renderer/components/operators/LFOEditor.tsx:14 | y | frontend/src/renderer/components/operators/OperatorRack.tsx |
| ModulationMatrix | frontend/src/renderer/components/operators/ModulationMatrix.tsx:62 | y | frontend/src/renderer/App.tsx |
| OperatorDepthArc | frontend/src/renderer/components/operators/OperatorDepthArc.tsx:43 | y | frontend/src/renderer/components/operators/OperatorKentaroCluster.tsx |
| OperatorKentaroCluster | frontend/src/renderer/components/operators/OperatorKentaroCluster.tsx:105 | y | frontend/src/renderer/components/operators/OperatorRack.tsx |
| OperatorRack | frontend/src/renderer/components/operators/OperatorRack.tsx:129 | y | frontend/src/renderer/App.tsx |
| TopologyEdge | frontend/src/renderer/components/operators/OperatorTopologyGraph.tsx:202 |  | (file-local) |
| OperatorTopologyGraph | frontend/src/renderer/components/operators/OperatorTopologyGraph.tsx:380 | y | frontend/src/renderer/components/operators/OperatorRack.tsx |
| RoutingLines | frontend/src/renderer/components/operators/RoutingLines.tsx:14 | y | frontend/src/renderer/App.tsx |
| StepSequencerEditor | frontend/src/renderer/components/operators/StepSequencerEditor.tsx:8 | y | frontend/src/renderer/components/operators/OperatorRack.tsx |
| VideoAnalyzerEditor | frontend/src/renderer/components/operators/VideoAnalyzerEditor.tsx:17 | y | frontend/src/renderer/components/operators/OperatorRack.tsx |
| MIDILearnOverlay | frontend/src/renderer/components/performance/MIDILearnOverlay.tsx:3 | y | frontend/src/renderer/components/performance/PerformancePanel.tsx |
| MapRow | frontend/src/renderer/components/performance/MIDIMapOverlay.tsx:323 |  | frontend/src/renderer/components/performance/MIDIMapOverlay.tsx |
| ParamPicker | frontend/src/renderer/components/performance/MIDIMapOverlay.tsx:387 |  | frontend/src/renderer/components/performance/MIDIMapOverlay.tsx |
| MIDIMapOverlay | frontend/src/renderer/components/performance/MIDIMapOverlay.tsx:62 | y | frontend/src/renderer/App.tsx |
| MIDIMapOverlayInner | frontend/src/renderer/components/performance/MIDIMapOverlay.tsx:68 |  | frontend/src/renderer/components/performance/MIDIMapOverlay.tsx |
| MIDISettings | frontend/src/renderer/components/performance/MIDISettings.tsx:6 | y | frontend/src/renderer/components/performance/PerformancePanel.tsx |
| PadCell | frontend/src/renderer/components/performance/PadCell.tsx:15 | y | frontend/src/renderer/components/performance/PadGrid.tsx |
| PadEditor | frontend/src/renderer/components/performance/PadEditor.tsx:22 | y | frontend/src/renderer/App.tsx |
| PadGrid | frontend/src/renderer/components/performance/PadGrid.tsx:10 | y | frontend/src/renderer/components/performance/PerformancePanel.tsx |
| PerformancePanel | frontend/src/renderer/components/performance/PerformancePanel.tsx:15 | y | frontend/src/renderer/App.tsx |
| BoundingBoxOverlay | frontend/src/renderer/components/preview/BoundingBoxOverlay.tsx:38 | y | frontend/src/renderer/App.tsx |
| MarchingAnts | frontend/src/renderer/components/preview/MaskSelectOverlay.tsx:107 |  | frontend/src/renderer/components/preview/MaskSelectOverlay.tsx |
| MaskSelectOverlay | frontend/src/renderer/components/preview/MaskSelectOverlay.tsx:190 | y | frontend/src/renderer/App.tsx |
| PopOutPreview | frontend/src/renderer/components/preview/PopOutPreview.tsx:20 | y | frontend/src/renderer/pop-out-entry.tsx |
| PreviewCanvas | frontend/src/renderer/components/preview/PreviewCanvas.tsx:52 | y | frontend/src/renderer/App.tsx |
| PreviewControls | frontend/src/renderer/components/preview/PreviewControls.tsx:31 | y | frontend/src/renderer/App.tsx |
| SnapGuides | frontend/src/renderer/components/preview/SnapGuides.tsx:26 | y | frontend/src/renderer/App.tsx |
| EdgeInspector | frontend/src/renderer/components/routing-canvas/EdgeInspector.tsx:48 | y | frontend/src/renderer/components/routing-canvas/RoutingCanvas.tsx |
| NodeColumn | frontend/src/renderer/components/routing-canvas/NodeColumn.tsx:78 | y | frontend/src/renderer/components/routing-canvas/RoutingCanvas.tsx |
| RoutingCanvas | frontend/src/renderer/components/routing-canvas/RoutingCanvas.tsx:179 | y | frontend/src/renderer/App.tsx |
| CanvasEdge | frontend/src/renderer/components/routing-canvas/RoutingCanvas.tsx:99 |  | (file-local) |
| MemoryStatus | frontend/src/renderer/components/statusbar/MemoryStatus.tsx:16 | y | frontend/src/renderer/App.tsx |
| TextOverlay | frontend/src/renderer/components/text/TextOverlay.tsx:17 | y | frontend/src/renderer/App.tsx |
| TextPanel | frontend/src/renderer/components/text/TextPanel.tsx:33 | y | frontend/src/renderer/App.tsx |
| AudioClipView | frontend/src/renderer/components/timeline/AudioClipView.tsx:19 | y | frontend/src/renderer/components/timeline/AudioTrack.tsx |
| AudioTrackMeter | frontend/src/renderer/components/timeline/AudioTrack.tsx:136 |  | frontend/src/renderer/components/timeline/AudioTrack.tsx |
| AudioTrackLane | frontend/src/renderer/components/timeline/AudioTrack.tsx:159 | y | frontend/src/renderer/components/timeline/Timeline.tsx |
| AudioTrackHeader | frontend/src/renderer/components/timeline/AudioTrack.tsx:22 | y | frontend/src/renderer/components/timeline/Timeline.tsx |
| ClipComponent | frontend/src/renderer/components/timeline/Clip.tsx:95 | y | frontend/src/renderer/components/timeline/Track.tsx |
| ContextMenu | frontend/src/renderer/components/timeline/ContextMenu.tsx:33 | y | frontend/src/renderer/components/automation/AutomationLane.tsx, frontend/src/renderer/components/device-chain/DeviceChain.tsx, frontend/src/renderer/components/effects/EffectRack.tsx, frontend/src/renderer/components/timeline/Clip.tsx, frontend/src/renderer/components/timeline/MasterTrack.tsx, frontend/src/renderer/components/timeline/Timeline.tsx, frontend/src/renderer/components/timeline/Track.tsx |
| GridOverlay | frontend/src/renderer/components/timeline/GridOverlay.tsx:44 | y | frontend/src/renderer/components/timeline/Timeline.tsx |
| InspectorTrackLane | frontend/src/renderer/components/timeline/InspectorTrack.tsx:123 | y | frontend/src/renderer/components/timeline/Timeline.tsx |
| InspectorTrackHeader | frontend/src/renderer/components/timeline/InspectorTrack.tsx:37 | y | frontend/src/renderer/components/timeline/Timeline.tsx |
| LayerPanel | frontend/src/renderer/components/timeline/LayerPanel.tsx:55 | y | frontend/src/renderer/App.tsx |
| LoopRegion | frontend/src/renderer/components/timeline/LoopRegion.tsx:8 | y | frontend/src/renderer/components/timeline/Timeline.tsx |
| MarkerFlag | frontend/src/renderer/components/timeline/MarkerFlag.tsx:14 | y | frontend/src/renderer/components/timeline/Timeline.tsx |
| MarqueeOverlay | frontend/src/renderer/components/timeline/MarqueeOverlay.tsx:122 | y | frontend/src/renderer/components/timeline/MasterTrack.tsx, frontend/src/renderer/components/timeline/Track.tsx |
| MasterTrackLane | frontend/src/renderer/components/timeline/MasterTrack.tsx:184 | y | frontend/src/renderer/components/timeline/Timeline.tsx |
| MasterTrackHeader | frontend/src/renderer/components/timeline/MasterTrack.tsx:55 | y | frontend/src/renderer/components/timeline/Timeline.tsx |
| Playhead | frontend/src/renderer/components/timeline/Playhead.tsx:10 | y | frontend/src/renderer/components/timeline/Timeline.tsx |
| ProbeScope | frontend/src/renderer/components/timeline/ProbeScope.tsx:27 | y | frontend/src/renderer/components/timeline/InspectorTrack.tsx |
| SpeedDialog | frontend/src/renderer/components/timeline/SpeedDialog.tsx:17 | y | frontend/src/renderer/App.tsx |
| Timeline | frontend/src/renderer/components/timeline/Timeline.tsx:67 | y | frontend/src/renderer/App.tsx, frontend/src/renderer/project-persistence.ts |
| TimeRuler | frontend/src/renderer/components/timeline/TimeRuler.tsx:21 | y | frontend/src/renderer/components/timeline/Timeline.tsx |
| TrackHeader | frontend/src/renderer/components/timeline/Track.tsx:39 | y | frontend/src/renderer/components/timeline/Timeline.tsx |
| LaneBadges | frontend/src/renderer/components/timeline/Track.tsx:661 | y | frontend/src/renderer/components/timeline/Track.tsx |
| TrackLane | frontend/src/renderer/components/timeline/Track.tsx:680 | y | frontend/src/renderer/components/timeline/Timeline.tsx |
| TransformPanel | frontend/src/renderer/components/timeline/TransformPanel.tsx:25 | y | frontend/src/renderer/App.tsx |
| UnifiedTrackHeader | frontend/src/renderer/components/timeline/UnifiedTrackHeader.tsx:131 | y | frontend/src/renderer/components/timeline/AudioTrack.tsx, frontend/src/renderer/components/timeline/InspectorTrack.tsx, frontend/src/renderer/components/timeline/MasterTrack.tsx, frontend/src/renderer/components/timeline/Track.tsx |
| ZoomScroll | frontend/src/renderer/components/timeline/ZoomScroll.tsx:8 | y | **orphan** |
| VolumeControl | frontend/src/renderer/components/transport/VolumeControl.tsx:17 | y | frontend/src/renderer/components/preview/PreviewControls.tsx |
| Waveform | frontend/src/renderer/components/transport/Waveform.tsx:15 | y | **orphan** |
| FileDialog | frontend/src/renderer/components/upload/FileDialog.tsx:7 | y | frontend/src/renderer/App.tsx |
| IngestProgress | frontend/src/renderer/components/upload/IngestProgress.tsx:6 | y | frontend/src/renderer/App.tsx |

## Panels

| panel | at | mounted in |
|---|---|---|
| DemosDrawer | frontend/src/renderer/components/demos/DemosDrawer.tsx:177 | frontend/src/renderer/App.tsx |
| HelpPanel | frontend/src/renderer/components/effects/HelpPanel.tsx:5 | frontend/src/renderer/App.tsx |
| ParamPanel | frontend/src/renderer/components/effects/ParamPanel.tsx:28 |  |
| Inspector | frontend/src/renderer/components/inspector/Inspector.tsx:92 | frontend/src/renderer/App.tsx |
| AboutDialog | frontend/src/renderer/components/layout/AboutDialog.tsx:10 | frontend/src/renderer/App.tsx |
| BankPagingHUD | frontend/src/renderer/components/layout/BankPagingHUD.tsx:25 | frontend/src/renderer/App.tsx |
| HistoryPanel | frontend/src/renderer/components/layout/HistoryPanel.tsx:5 | frontend/src/renderer/App.tsx |
| MappingContextChip | frontend/src/renderer/components/layout/MappingContextChip.tsx:18 | frontend/src/renderer/App.tsx |
| Preferences | frontend/src/renderer/components/layout/Preferences.tsx:25 | frontend/src/renderer/App.tsx |
| QuantizeReadout | frontend/src/renderer/components/layout/QuantizeReadout.tsx:14 | frontend/src/renderer/App.tsx |
| ShortcutEditor | frontend/src/renderer/components/layout/ShortcutEditor.tsx:9 | frontend/src/renderer/components/layout/Preferences.tsx |
| ToolFlyout | frontend/src/renderer/components/layout/ToolRail.tsx:111 | frontend/src/renderer/components/layout/ToolRail.tsx |
| ToolRail | frontend/src/renderer/components/layout/ToolRail.tsx:234 | frontend/src/renderer/App.tsx |
| UpdateBanner | frontend/src/renderer/components/layout/UpdateBanner.tsx:10 | frontend/src/renderer/App.tsx |
| WelcomeScreen | frontend/src/renderer/components/layout/WelcomeScreen.tsx:24 | frontend/src/renderer/App.tsx |
| MaskStackPanel | frontend/src/renderer/components/masking/MaskStackPanel.tsx:257 | frontend/src/renderer/App.tsx |
| B9EdgeInspector | frontend/src/renderer/components/operators/B9EdgeInspector.tsx:145 | frontend/src/renderer/components/operators/OperatorRack.tsx |
| PerformancePanel | frontend/src/renderer/components/performance/PerformancePanel.tsx:15 | frontend/src/renderer/App.tsx |
| EdgeInspector | frontend/src/renderer/components/routing-canvas/EdgeInspector.tsx:48 | frontend/src/renderer/components/routing-canvas/RoutingCanvas.tsx |
| TextPanel | frontend/src/renderer/components/text/TextPanel.tsx:33 | frontend/src/renderer/App.tsx |
| LayerPanel | frontend/src/renderer/components/timeline/LayerPanel.tsx:55 | frontend/src/renderer/App.tsx |
| TransformPanel | frontend/src/renderer/components/timeline/TransformPanel.tsx:25 | frontend/src/renderer/App.tsx |

## Dialogs

| component | at | role | className |
|---|---|---|---|
| DemosDrawer | frontend/src/renderer/components/demos/DemosDrawer.tsx:217 | dialog | demos-drawer |
| CrashRecoveryDialog | frontend/src/renderer/components/dialogs/CrashRecoveryDialog.tsx:48 | dialog | dialog crash-recovery |
| ExportDialog | frontend/src/renderer/components/dialogs/ExportDialog.tsx:444 | dialog | dialog export-dialog |
| FeedbackDialog | frontend/src/renderer/components/dialogs/FeedbackDialog.tsx:42 | dialog | dialog feedback-dialog |
| FeedbackDialog | frontend/src/renderer/components/dialogs/FeedbackDialog.tsx:60 | dialog | dialog feedback-dialog |
| RelinkDialog | frontend/src/renderer/components/dialogs/RelinkDialog.tsx:94 | dialog | dialog relink-dialog |
| TelemetryConsentDialog | frontend/src/renderer/components/dialogs/TelemetryConsentDialog.tsx:19 | dialog | dialog consent-dialog |
| UnsavedChangesDialog | frontend/src/renderer/components/dialogs/UnsavedChangesDialog.tsx:54 | dialog | dialog |
| AboutDialog | frontend/src/renderer/components/layout/AboutDialog.tsx:19 | dialog | dialog about-dialog |
| Preferences | frontend/src/renderer/components/layout/Preferences.tsx:136 | dialog | preferences |
| PresetSaveDialog | frontend/src/renderer/components/library/PresetSaveDialog.tsx:100 | dialog | dialog preset-save |
| MIDIMapOverlayInner | frontend/src/renderer/components/performance/MIDIMapOverlay.tsx:225 | dialog | midi-map-overlay |
| PadEditor | frontend/src/renderer/components/performance/PadEditor.tsx:87 |  | export-dialog |
| RoutingCanvas | frontend/src/renderer/components/routing-canvas/RoutingCanvas.tsx:433 | dialog | routing-canvas-overlay |
| SpeedDialog | frontend/src/renderer/components/timeline/SpeedDialog.tsx:49 | dialog | speed-dialog |

## Drag & drop

### HTML5 drag sources

| component | at | tag | draggable |
|---|---|---|---|
| EffectBrowser | frontend/src/renderer/components/effects/EffectBrowser.tsx:545 | button | {chainLength < LIMITS.MAX_EFFECTS_PER_CHAIN} |
| EffectBrowser | frontend/src/renderer/components/effects/EffectBrowser.tsx:589 | button | {chainLength < LIMITS.MAX_EFFECTS_PER_CHAIN} |
| EffectBrowser | frontend/src/renderer/components/effects/EffectBrowser.tsx:623 | button | true |
| EffectBrowser | frontend/src/renderer/components/effects/EffectBrowser.tsx:642 | button | {chainLength < LIMITS.MAX_EFFECTS_PER_CHAIN} |
| ParamPanel | frontend/src/renderer/components/effects/ParamPanel.tsx:110 | div | true |
| InstrumentsBrowser | frontend/src/renderer/components/instruments/InstrumentsBrowser.tsx:167 | div | {isDraggable} |
| PresetCard | frontend/src/renderer/components/library/PresetCard.tsx:18 | div | true |
| NodeColumn | frontend/src/renderer/components/routing-canvas/NodeColumn.tsx:163 | div | {draggable} |
| ClipComponent | frontend/src/renderer/components/timeline/Clip.tsx:701 | img | {false} |

### HTML5 drop targets

| component | at | tag | handlers |
|---|---|---|---|
| AppInner | frontend/src/renderer/App.tsx:3566 | div | onDrop,onDragOver,onDragEnter |
| DeviceCard | frontend/src/renderer/components/device-chain/DeviceCard.tsx:412 | div | onDrop,onDragOver |
| InspectorTrackLane | frontend/src/renderer/components/timeline/InspectorTrack.tsx:219 | div | onDrop,onDragOver |
| TrackHeader | frontend/src/renderer/components/timeline/Track.tsx:360 | UnifiedTrackHeader | onDrop,onDragOver |
| TrackHeader | frontend/src/renderer/components/timeline/Track.tsx:440 | div | onDrop,onDragOver |
| UnifiedTrackHeader | frontend/src/renderer/components/timeline/UnifiedTrackHeader.tsx:180 | div | onDrop,onDragOver |

### DataTransfer payload types

| op | type | component | at |
|---|---|---|---|
| types.includes | EFFECT_DRAG_TYPE | DeviceChain | frontend/src/renderer/components/device-chain/DeviceChain.tsx:181 |
| getData | EFFECT_DRAG_TYPE | DeviceChain | frontend/src/renderer/components/device-chain/DeviceChain.tsx:197 |
| getData | CREATRIX_NONCE_TYPE | DeviceChain | frontend/src/renderer/components/device-chain/DeviceChain.tsx:206 |
| getData | CREATRIX_NONCE_TYPE | (module) | frontend/src/renderer/components/effects/EffectBrowser.tsx:65 |
| getData | EFFECT_DRAG_TYPE | (module) | frontend/src/renderer/components/effects/EffectBrowser.tsx:68 |
| setData | EFFECT_DRAG_TYPE | EffectBrowser | frontend/src/renderer/components/effects/EffectBrowser.tsx:447 |
| setData | CREATRIX_NONCE_TYPE | EffectBrowser | frontend/src/renderer/components/effects/EffectBrowser.tsx:448 |
| setData | text/plain | EffectBrowser | frontend/src/renderer/components/effects/EffectBrowser.tsx:450 |
| setData | EFFECT_DRAG_TYPE | (module) | frontend/src/renderer/components/effects/operator-drag.ts:79 |
| setData | CREATRIX_NONCE_TYPE | (module) | frontend/src/renderer/components/effects/operator-drag.ts:83 |
| setData | text/plain | (module) | frontend/src/renderer/components/effects/operator-drag.ts:84 |
| types.includes | EFFECT_DRAG_TYPE | (module) | frontend/src/renderer/components/effects/operator-drag.ts:105 |
| setData | PARAM_PROBE_DRAG_TYPE | ParamPanel | frontend/src/renderer/components/effects/ParamPanel.tsx:122 |
| setData | EFFECT_DRAG_TYPE | InstrumentsBrowser | frontend/src/renderer/components/instruments/InstrumentsBrowser.tsx:177 |
| setData | CREATRIX_NONCE_TYPE | InstrumentsBrowser | frontend/src/renderer/components/instruments/InstrumentsBrowser.tsx:178 |
| setData | INSTRUMENT_DRAG_TYPE | InstrumentsBrowser | frontend/src/renderer/components/instruments/InstrumentsBrowser.tsx:180 |
| setData | text/plain | InstrumentsBrowser | frontend/src/renderer/components/instruments/InstrumentsBrowser.tsx:181 |
| setData | application/entropic-preset | PresetCard | frontend/src/renderer/components/library/PresetCard.tsx:22 |
| types.includes | ROUTING_SOURCE_DRAG_TYPE | NodeColumn | frontend/src/renderer/components/routing-canvas/NodeColumn.tsx:143 |
| getData | ROUTING_SOURCE_DRAG_TYPE | NodeColumn | frontend/src/renderer/components/routing-canvas/NodeColumn.tsx:149 |
| setData | ROUTING_SOURCE_DRAG_TYPE | NodeColumn | frontend/src/renderer/components/routing-canvas/NodeColumn.tsx:188 |
| getData | PARAM_PROBE_DRAG_TYPE | InspectorTrackLane | frontend/src/renderer/components/timeline/InspectorTrack.tsx:173 |
| types.includes | PARAM_PROBE_DRAG_TYPE | InspectorTrackLane | frontend/src/renderer/components/timeline/InspectorTrack.tsx:194 |
| types.includes | INSTRUMENT_DRAG_TYPE | TrackHeader | frontend/src/renderer/components/timeline/Track.tsx:306 |
| types.includes | EFFECT_DRAG_TYPE | TrackHeader | frontend/src/renderer/components/timeline/Track.tsx:314 |
| getData | EFFECT_DRAG_TYPE | TrackHeader | frontend/src/renderer/components/timeline/Track.tsx:328 |
| getData | INSTRUMENT_DRAG_TYPE | TrackHeader | frontend/src/renderer/components/timeline/Track.tsx:341 |
| types.includes | INSTRUMENT_DRAG_TYPE | TrackHeader | frontend/src/renderer/components/timeline/Track.tsx:457 |
| types.includes | EFFECT_DRAG_TYPE | TrackHeader | frontend/src/renderer/components/timeline/Track.tsx:468 |
| getData | EFFECT_DRAG_TYPE | TrackHeader | frontend/src/renderer/components/timeline/Track.tsx:488 |
| getData | INSTRUMENT_DRAG_TYPE | TrackHeader | frontend/src/renderer/components/timeline/Track.tsx:502 |

### Pointer-drag candidates (pointer/mouse-down in files with move listeners)

| component | at | tag |
|---|---|---|
| AppInner | frontend/src/renderer/App.tsx:3834 | div |
| AppInner | frontend/src/renderer/App.tsx:3864 | div |
| AppInner | frontend/src/renderer/App.tsx:4037 | div |
| AppInner | frontend/src/renderer/App.tsx:4165 | div |
| AutomationNode | frontend/src/renderer/components/automation/AutomationNode.tsx:278 | circle |
| AutomationTransformBox | frontend/src/renderer/components/automation/AutomationTransformBox.tsx:324 | rect |
| OperatorKentaroCluster | frontend/src/renderer/components/operators/OperatorKentaroCluster.tsx:356 | div |
| BoundingBoxOverlay | frontend/src/renderer/components/preview/BoundingBoxOverlay.tsx:251 | rect |
| BoundingBoxOverlay | frontend/src/renderer/components/preview/BoundingBoxOverlay.tsx:266 | rect |
| BoundingBoxOverlay | frontend/src/renderer/components/preview/BoundingBoxOverlay.tsx:286 | rect |
| BoundingBoxOverlay | frontend/src/renderer/components/preview/BoundingBoxOverlay.tsx:307 | circle |
| MaskSelectOverlay | frontend/src/renderer/components/preview/MaskSelectOverlay.tsx:790 | svg |
| MaskSelectOverlay | frontend/src/renderer/components/preview/MaskSelectOverlay.tsx:942 | svg |
| TextOverlay | frontend/src/renderer/components/text/TextOverlay.tsx:117 | div |
| ClipComponent | frontend/src/renderer/components/timeline/Clip.tsx:688 | div |
| ClipComponent | frontend/src/renderer/components/timeline/Clip.tsx:717 | div |
| ClipComponent | frontend/src/renderer/components/timeline/Clip.tsx:724 | input |
| ClipComponent | frontend/src/renderer/components/timeline/Clip.tsx:767 | div |

## Context menus (onContextMenu)

| component | at | tag |
|---|---|---|
| AutomationLane | frontend/src/renderer/components/automation/AutomationLane.tsx:410 | svg |
| AutomationNode | frontend/src/renderer/components/automation/AutomationNode.tsx:278 | circle |
| Knob | frontend/src/renderer/components/common/Knob.tsx:206 | svg |
| Slider | frontend/src/renderer/components/common/Slider.tsx:152 | div |
| ABSwitch | frontend/src/renderer/components/device-chain/ABSwitch.tsx:48 | button |
| DeviceCard | frontend/src/renderer/components/device-chain/DeviceCard.tsx:298 | div |
| DeviceCard | frontend/src/renderer/components/device-chain/DeviceCard.tsx:316 | div |
| DeviceCard | frontend/src/renderer/components/device-chain/DeviceCard.tsx:412 | div |
| DeviceChain | frontend/src/renderer/components/device-chain/DeviceChain.tsx:541 | DeviceCard |
| EffectRack | frontend/src/renderer/components/effects/EffectRack.tsx:133 | div |
| ParamPanel | frontend/src/renderer/components/effects/ParamPanel.tsx:110 | div |
| ParamProbeRow | frontend/src/renderer/components/inspector/InspectorEffectState.tsx:73 | div |
| FrameBankDevice | frontend/src/renderer/components/instruments/FrameBankDevice.tsx:192 | Slider |
| FrameBankDevice | frontend/src/renderer/components/instruments/FrameBankDevice.tsx:241 | input |
| GranulatorDevice | frontend/src/renderer/components/instruments/GranulatorDevice.tsx:268 | input |
| GranulatorDevice | frontend/src/renderer/components/instruments/GranulatorDevice.tsx:353 | Slider |
| GranulatorDevice | frontend/src/renderer/components/instruments/GranulatorDevice.tsx:371 | Slider |
| GranulatorDevice | frontend/src/renderer/components/instruments/GranulatorDevice.tsx:389 | Slider |
| GranulatorDevice | frontend/src/renderer/components/instruments/GranulatorDevice.tsx:407 | Slider |
| MacroRow | frontend/src/renderer/components/instruments/RackDevice.tsx:626 | Slider |
| SamplerDevice | frontend/src/renderer/components/instruments/SamplerDevice.tsx:56 | input |
| SamplerDevice | frontend/src/renderer/components/instruments/SamplerDevice.tsx:72 | input |
| SamplerDevice | frontend/src/renderer/components/instruments/SamplerDevice.tsx:90 | Slider |
| ToolRail | frontend/src/renderer/components/layout/ToolRail.tsx:320 | button |
| NodeCard | frontend/src/renderer/components/masking/MaskStackPanel.tsx:206 | Slider |
| NodeCard | frontend/src/renderer/components/masking/MaskStackPanel.tsx:228 | Slider |
| ClipComponent | frontend/src/renderer/components/timeline/Clip.tsx:688 | div |
| MarkerFlag | frontend/src/renderer/components/timeline/MarkerFlag.tsx:73 | div |
| MarkerFlag | frontend/src/renderer/components/timeline/MarkerFlag.tsx:84 | input |
| MasterTrackHeader | frontend/src/renderer/components/timeline/MasterTrack.tsx:144 | UnifiedTrackHeader |
| Timeline | frontend/src/renderer/components/timeline/Timeline.tsx:434 | div |
| TrackHeader | frontend/src/renderer/components/timeline/Track.tsx:360 | UnifiedTrackHeader |
| TrackHeader | frontend/src/renderer/components/timeline/Track.tsx:440 | div |
| TransformPanel | frontend/src/renderer/components/timeline/TransformPanel.tsx:119 | input |
| TransformPanel | frontend/src/renderer/components/timeline/TransformPanel.tsx:130 | input |
| TransformPanel | frontend/src/renderer/components/timeline/TransformPanel.tsx:144 | input |
| TransformPanel | frontend/src/renderer/components/timeline/TransformPanel.tsx:165 | input |
| TransformPanel | frontend/src/renderer/components/timeline/TransformPanel.tsx:182 | input |
| TransformPanel | frontend/src/renderer/components/timeline/TransformPanel.tsx:219 | Slider |
| UnifiedTrackHeader | frontend/src/renderer/components/timeline/UnifiedTrackHeader.tsx:180 | div |

## Modifier-key checks by component (gesture-table input)

| component (file) | modifiers tested |
|---|---|
| (module) (components/common/Knob.tsx) | ctrlKey metaKey shiftKey |
| (module) (hooks/useModalBehavior.ts) | shiftKey |
| (module) (utils/shortcuts.ts) | altKey ctrlKey metaKey shiftKey |
| ABSwitch (components/device-chain/ABSwitch.tsx) | shiftKey |
| AppInner (App.tsx) | ctrlKey metaKey |
| AutomationLane (components/automation/AutomationLane.tsx) | shiftKey |
| AutomationNode (components/automation/AutomationNode.tsx) | altKey shiftKey |
| BoundingBoxOverlay (components/preview/BoundingBoxOverlay.tsx) | shiftKey |
| ClipComponent (components/timeline/Clip.tsx) | ctrlKey metaKey shiftKey |
| Knob (components/common/Knob.tsx) | ctrlKey metaKey shiftKey |
| MarqueeOverlay (components/timeline/MarqueeOverlay.tsx) | altKey shiftKey |
| MaskSelectOverlay (components/preview/MaskSelectOverlay.tsx) | altKey shiftKey |
| Slider (components/common/Slider.tsx) | shiftKey |
| TextOverlay (components/text/TextOverlay.tsx) | shiftKey |
| Timeline (components/timeline/Timeline.tsx) | ctrlKey metaKey |

## Double-click sites

| component | at | tag |
|---|---|---|
| AppInner | frontend/src/renderer/App.tsx:3896 | div |
| AutomationNode | frontend/src/renderer/components/automation/AutomationNode.tsx:278 | circle |
| AutomationTransformBox | frontend/src/renderer/components/automation/AutomationTransformBox.tsx:324 | rect |
| Knob | frontend/src/renderer/components/common/Knob.tsx:206 | svg |
| Knob | frontend/src/renderer/components/common/Knob.tsx:270 | div |
| Slider | frontend/src/renderer/components/common/Slider.tsx:148 | span |
| Slider | frontend/src/renderer/components/common/Slider.tsx:152 | div |
| InstrumentsBrowser | frontend/src/renderer/components/instruments/InstrumentsBrowser.tsx:167 | div |
| RackDevice | frontend/src/renderer/components/instruments/RackDevice.tsx:342 | div |
| PadCell | frontend/src/renderer/components/performance/PadCell.tsx:31 | div |
| MaskSelectOverlay | frontend/src/renderer/components/preview/MaskSelectOverlay.tsx:790 | svg |
| TextOverlay | frontend/src/renderer/components/text/TextOverlay.tsx:117 | div |
| ClipComponent | frontend/src/renderer/components/timeline/Clip.tsx:736 | span |
| MarkerFlag | frontend/src/renderer/components/timeline/MarkerFlag.tsx:73 | div |
| MarkerFlag | frontend/src/renderer/components/timeline/MarkerFlag.tsx:84 | input |
| TrackHeader | frontend/src/renderer/components/timeline/Track.tsx:536 | div |
| TransformPanel | frontend/src/renderer/components/timeline/TransformPanel.tsx:118 | span |
| TransformPanel | frontend/src/renderer/components/timeline/TransformPanel.tsx:129 | span |
| TransformPanel | frontend/src/renderer/components/timeline/TransformPanel.tsx:143 | span |
| TransformPanel | frontend/src/renderer/components/timeline/TransformPanel.tsx:164 | span |
| TransformPanel | frontend/src/renderer/components/timeline/TransformPanel.tsx:181 | span |
| UnifiedTrackHeader | frontend/src/renderer/components/timeline/UnifiedTrackHeader.tsx:249 | div |

## Empty states

| component | at | tag | className | text |
|---|---|---|---|---|
| DeviceChain | frontend/src/renderer/components/device-chain/DeviceChain.tsx:494 | EmptyState |  | {isDragOver ? 'Release to add effect' : 'No effects yet — bro} |
| EffectBrowser | frontend/src/renderer/components/effects/EffectBrowser.tsx:564 | EmptyState | effect-browser__empty | No effects found |
| EffectBrowser | frontend/src/renderer/components/effects/EffectBrowser.tsx:664 | EmptyState | effect-browser__empty | No composite effects registered |
| EffectRack | frontend/src/renderer/components/effects/EffectRack.tsx:109 | div | effect-rack effect-rack--empty |  |
| HelpPanel | frontend/src/renderer/components/effects/HelpPanel.tsx:14 | EmptyState | help-panel__empty | Hover an effect for details |
| ParamPanel | frontend/src/renderer/components/effects/ParamPanel.tsx:85 | div | param-panel param-panel--empty |  |
| RenderQueue | frontend/src/renderer/components/export/RenderQueue.tsx:73 | EmptyState | render-queue__empty | No jobs in queue |
| HistoryPanel | frontend/src/renderer/components/layout/HistoryPanel.tsx:38 | EmptyState | history-panel__empty | No actions yet |
| PresetBrowser | frontend/src/renderer/components/library/PresetBrowser.tsx:70 | EmptyState | preset-browser__empty | {searchQuery \|\| categoryFilter ? 'No matching presets' : 'No } |
| MaskStackPanel | frontend/src/renderer/components/masking/MaskStackPanel.tsx:284 | EmptyState | mask-stack-panel__empty | no matte nodes |
| ModulationMatrix | frontend/src/renderer/components/operators/ModulationMatrix.tsx:143 | div | mod-matrix mod-matrix--empty |  |
| OperatorRack | frontend/src/renderer/components/operators/OperatorRack.tsx:201 | EmptyState | operator-rack__empty | No operators — click + Add to create one |
| OperatorTopologyGraph | frontend/src/renderer/components/operators/OperatorTopologyGraph.tsx:494 | div | operator-topology operator-topology--empty |  |
| MIDISettings | frontend/src/renderer/components/performance/MIDISettings.tsx:71 | EmptyState | midi-settings__empty | No CC mappings — right-click a knob to learn |
| PreviewCanvas | frontend/src/renderer/components/preview/PreviewCanvas.tsx:191 | EmptyState | preview-canvas__placeholder | Drag a clip here, or ⌘I to import. |
| EdgeInspector | frontend/src/renderer/components/routing-canvas/EdgeInspector.tsx:59 | div | routing-edge-inspector routing-edge-inspector--empty |  |
| NodeColumn | frontend/src/renderer/components/routing-canvas/NodeColumn.tsx:128 | EmptyState | routing-column__empty | {disabled ? 'no routings yet' : 'no matches'} |
| InspectorTrackLane | frontend/src/renderer/components/timeline/InspectorTrack.tsx:227 | EmptyState | inspector-track-lane__empty | Drag a parameter here to add a probe |
| LayerPanel | frontend/src/renderer/components/timeline/LayerPanel.tsx:125 | div | b3-layer b3-layer--empty |  |
| LayerPanel | frontend/src/renderer/components/timeline/LayerPanel.tsx:126 | EmptyState |  | Select a track to edit its blend, opacity, and mattes. |

## Feature flags

| flag | sites |
|---|---|
| F_0512_ | 1: frontend/src/shared/feature-flags.ts:4 |
| F_CREATRIX_LAYOUT | 12: frontend/src/renderer/App.tsx:62, frontend/src/renderer/components/effects/EffectBrowser.tsx:153, frontend/src/renderer/components/effects/EffectBrowser.tsx:682, frontend/src/renderer/components/effects/EffectBrowser.tsx:710 … |

## Planning docs

| doc | title | lines | last commit | decision ids | open markers | stale cites | doc testids not in code |
|---|---|---|---|---|---|---|---|
| docs/plans/2026-02-22-phase-0b-pipeline-validation-plan.md | Phase 0B: Pipeline Validation — Build Plan | 327 | 2026-02-23 | 0 | 0 | 1 | 0 |
| docs/plans/2026-02-28-phase3-uat-plan.md | Phase 3 Color Suite — UAT Plan | 186 | 2026-02-28 | 4 | 0 | 0 | 0 |
| docs/plans/2026-03-15-phase10-freeze-library-plan.md | Phase 10: Freeze/Flatten + Library — Implementation Plan | 327 | 2026-03-15 | 0 | 0 | 8 | 0 |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | Phase 11: Export + Polish — Implementation Plan | 395 | 2026-03-16 | 0 | 0 | 33 | 0 |
| docs/plans/2026-03-15-ship-gate-audit-plan.md | Ship Gate Audit — Entropic v2 Challenger | 645 | 2026-03-16 | 0 | 0 | 0 | 0 |
| docs/plans/2026-03-16-feat-ux-redesign-arrangement-view-plan.md | UX Redesign — Arrangement View + Ableton Device Chain | 621 | 2026-03-16 | 0 | 2 | 5 | 1 |
| docs/plans/2026-04-10-phase-next-eng-pickup.md | Phase Next: Everything Not Coded Properly | 278 | 2026-04-16 | 0 | 0 | 1 | 0 |
| docs/plans/2026-05-04-cross-modal-features-plan.md | Cross-Modal Features Release Plan | 311 | 2026-05-14 | 0 | 0 | 35 | 0 |
| docs/plans/2026-05-06-feat-asciiphantom-plan.md | AsciiPhantom — Build Plan | 75 | 2026-05-14 | 0 | 0 | 1 | 0 |
| docs/plans/2026-05-06-feat-entropydomainwarp-plan.md | feat/entropydomainwarp — Plan | 48 | 2026-05-14 | 0 | 0 | 0 | 0 |
| docs/plans/2026-05-06-feat-logisticgenerationloss-plan.md | Feat: fx.logistic_generation_loss — recursive JPEG decay driven by the | 125 | 2026-05-14 | 0 | 0 | 0 | 0 |
| docs/plans/2026-05-06-fix-composite-state-gap.md | Composite per-layer state gap | 61 | 2026-05-14 | 0 | 0 | 0 | 0 |
| docs/plans/2026-05-06-fix-preview-state-gap.md | Fix: Per-Effect State Propagation in Preview Render Path | 73 | 2026-05-14 | 0 | 0 | 0 | 0 |
| docs/plans/2026-05-06-refactor-registry-consolidation.md | Registry list consolidation | 34 | 2026-05-14 | 0 | 0 | 0 | 0 |
| docs/plans/2026-05-14-hotkey-discoverability-plan.md | Hotkey discoverability sprint | 165 | 2026-05-14 | 0 | 0 | 7 | 0 |
| docs/plans/2026-05-14-upcoming-ux-items.md | Upcoming UX items | 85 | 2026-06-12 | 2 | 0 | 0 | 0 |
| docs/plans/2026-05-15-mount-and-bug-sweep-plan.md | Goal | 122 | 2026-05-15 | 24 | 0 | 4 | 0 |
| docs/plans/2026-06-17-p1b-uat-fix-plan.md | Creatrix UAT Fix-Plan (2026-06-17) | 175 | 2026-07-02 | 1 | 0 | 2 | 0 |
| docs/plans/2026-06-audio-tracks-bake-checklist.md | Audio-Tracks 1-Week Bake Checklist | 66 | 2026-06-12 | 0 | 0 | 4 | 0 |
| docs/plans/2026-07-02-b3-layout-redesign-prd.md | Creatrix B3 Layout Redesign — PRD | 119 | 2026-07-02 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-02-master-tuneup-plan.md | Creatrix Master Tune-Up & Build Plan (2026-07-02) | 198 | 2026-07-02 | 5 | 0 | 0 | 0 |
| docs/plans/2026-07-02-month-audit-fix-plan.md | Month-Audit Fix Plan (2026-07-02) | 173 | 2026-07-02 | 5 | 1 | 6 | 0 |
| docs/plans/2026-07-02-tuneup-handoff.md | Tune-Up Campaign Handoff (2026-07-02) | 83 | 2026-07-02 | 2 | 0 | 0 | 0 |
| docs/plans/2026-07-03-aa3-live-generators-spec.md | AA.3 — Live Generators / Audio-Follower ON an Automation Lane | 416 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-03-automation-ableton-adoption-prd.md | Automation Adoption PRD — "spatial automation" | 100 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-03-automation-buildready.md | Automation editing suite — build-ready (verified against code) | 82 | 2026-07-03 | 0 | 0 | 2 | 0 |
| docs/plans/2026-07-03-automation-editing-gestures.md | Automation editing gestures (AA.4b) | 72 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-03-master-out-bus-prd.md | Master-Out Bus PRD | 94 | 2026-07-03 | 1 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/ARCHITECTURE.md | Mapping Framework — Architecture | 107 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/BUILD-PLAN.md | Field-Mapping — Build Plan (the package) | 69 | 2026-07-03 | 1 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/CATALOG.md | Catalog — utilities, destinations, effects, compositions | 79 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/CTO-BUILDABLE-IDEAS.md | CTO — 20 High-Leverage Buildable Ideas | 47 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/HANDOFF.md | HANDOFF — Field-Mapping / Pre-Routed Presets (for the next session) | 84 | 2026-07-03 | 4 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/MARATHON-BRIEF-wave0-AMENDED.md | MARATHON BRIEF — Wave 0 + U0 (pre-routed preset MVP) | 55 | 2026-07-04 | 4 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/MARATHON-BRIEF-wave0.md | MARATHON BRIEF — Wave 0 + U0 (pre-routed preset MVP) | 44 | 2026-07-03 | 4 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/_TEMPLATE.md | PRD — <Element Name> | 36 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-composition-morph.md | PRD — Composition Morph (crossfade between recipes) | 46 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-cross-modal-routeout.md | PRD — Cross-Modal Route-Out (visual field → audio param) | 40 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-depth-utility.md | PRD — Depth Utility | 49 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-displace-destination.md | PRD — Displace (the coord-field destination) | 48 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-edge-curve-ui.md | PRD — Editable per-edge Curve (easing on every routing) | 37 | 2026-07-03 | 0 | 0 | 1 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-entropy-luma-utilities.md | PRD — Entropy / Luminance Utilities (the "free" field sources) | 33 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-field-mixer.md | PRD — Field Mixer | 40 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-field-solver-spike.md | PRD — Field-Solver Substrate: SPIKE GATE (measure before you commit) | 49 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-field-solver-substrate.md | PRD — Field-Solver Substrate (the sim keystone) | 50 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-kuwahara-npr.md | PRD — Kuwahara / NPR (motion-coherent + juiced) | 49 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-mapping-framework.md | PRD — Mapping Framework (the keystone) | 56 | 2026-07-03 | 0 | 0 | 1 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-mix-macro.md | PRD — `_mix` as a mappable Wet/Dry macro | 35 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-optical-flow-utility.md | PRD — Optical-Flow Utility | 34 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-physarum.md | PRD — Physarum / Foraging | 36 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-prerouted-presets-library.md | PRD — Pre-Routed Chained Presets + the Presets Library (FLAGSHIP) | 67 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-self-steering-distortion.md | PRD — Self-Steering Distortion | 34 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-signal-tap.md | PRD — Signal Tap (expose existing effects' internal fields as modulati | 55 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-structure-tensor-utility.md | PRD — Structure-Tensor Utility | 50 | 2026-07-03 | 1 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/prd/PRD-wave0-preset-mvp.md | PRD — Wave 0: Pre-Routed Preset MVP (buildable now) | 68 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/PRESET-ARTDIRECTOR-20.md | Art Director — 20 aesthetically-directed presets | 35 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/PRESET-CATALOG.md | Pre-Routed Preset Catalog (recipe packs) | 93 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/PRESET-TOP50.md | The Gated Launch Set — 50 max (hard cap) | 76 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/README.md | Creatrix — Field-Mapping Initiative (consolidation + plan) | 115 | 2026-07-03 | 1 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/REVIEW.md | Review — coherence, UX routing, lifecycle, edge cases (tech-spec readi | 165 | 2026-07-03 | 4 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/SOURCES-SPEC.md | Modulation Sources — canonical spec (shape → affordances → interaction | 100 | 2026-07-03 | 0 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/SPIKES.md | Spike Register — itemized + worked through (2026-07-03) | 32 | 2026-07-03 | 4 | 0 | 0 | 0 |
| docs/plans/2026-07-field-mapping/UNIFICATION-2026-07-03.md | UNIFICATION — Field-Mapping (Branch A) × Routing Design Suite (Branch  | 97 | 2026-07-04 | 0 | 0 | 0 | 0 |
| docs/plans/q7/PR-02-sg7-codec-timeout-plan.md | PR #2 — SG-7 Codec Timeout | 93 | 2026-06-04 | 0 | 0 | 0 | 0 |
| docs/plans/sprint-2B-1-audio-decode.md | Sprint 2B-1: Audio Decode (PyAV → PCM) | 45 | 2026-02-27 | 0 | 0 | 0 | 0 |
| docs/plans/sprint-2B-2-waveform.md | Sprint 2B-2: Waveform Generation (PCM → Peaks) | 48 | 2026-02-27 | 0 | 0 | 0 | 0 |
| docs/plans/sprint-2B-3-playback.md | Sprint 2B-3: Audio Playback (sounddevice) | 54 | 2026-02-27 | 0 | 0 | 0 | 0 |
| docs/plans/sprint-2B-4-av-sync.md | Sprint 2B-4: A/V Sync Clock (Audio Master, Video Slave) | 53 | 2026-02-27 | 0 | 0 | 0 | 0 |
| docs/plans/sprint-2B-5-audio-store.md | Sprint 2B-5: Frontend Audio Store + IPC Types | 40 | 2026-02-27 | 0 | 0 | 0 | 0 |
| docs/plans/transitions-pattern.md | Transitions Content Sprint — Pattern Doc | 182 | 2026-07-02 | 0 | 0 | 3 | 0 |
| docs/roadmap/AUTOMATION-ABLETON-SUITE.md | Roadmap — Automation Editing Suite (Ableton-parity + spatial axis) & M | 43 | 2026-07-03 | 0 | 3 | 0 | 0 |
| docs/roadmap/DESIGN-SPEC.md | Creatrix Design Language v1 — "Live Signal" | 356 | 2026-07-30 | 3 | 0 | 1 | 0 |
| docs/roadmap/EXECUTION-PLAN.md | Creatrix Execution Plan — One-Shottable Work Packets | 666 | 2026-07-30 | 9 | 3 | 3 | 0 |
| docs/roadmap/INDEX.md | Creatrix Documentation Index — Canonical Map | 89 | 2026-07-02 | 2 | 1 | 0 | 0 |
| docs/roadmap/layout-session/B1-1VOICE-SAMPLER-PLAN.md | B1 — Read-only 1-voice Sampler | 157 | 2026-06-11 | 0 | 0 | 3 | 0 |
| docs/roadmap/layout-session/DECISIONS.md | Creatrix redesign — decisions worksheet | 161 | 2026-06-11 | 0 | 0 | 0 | 0 |
| docs/roadmap/layout-session/INSTRUMENTS-BUILD-PLAN.md | Creatrix Instruments — Sequenced Build Plan | 474 | 2026-06-11 | 0 | 0 | 0 | 0 |
| docs/roadmap/layout-session/INSTRUMENTS.md | Creatrix — Instruments & Performance | 448 | 2026-06-11 | 0 | 0 | 0 | 0 |
| docs/roadmap/layout-session/PLAN.md | Creatrix arrangement-view redesign — implementation plan (v1.2) | 741 | 2026-06-11 | 1 | 0 | 13 | 0 |
| docs/roadmap/layout-session/PR-INJECTIONS.md | PR-INJECTIONS — for the Creatrix BUILD session | 120 | 2026-06-11 | 0 | 0 | 2 | 0 |
| docs/roadmap/MASKING-INTERACTIONS.md | Creatrix Selection / Masking / Alpha — INTERACTION SPECIFICATION | 693 | 2026-06-12 | 17 | 0 | 2 | 0 |
| docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md | Missing-Functions Inventory — Creatrix | 218 | 2026-06-11 | 1 | 0 | 1 | 0 |
| docs/roadmap/MK12-SUBJECT-MATTE-PRD.md | MK.12 — AI Subject Matte (RVM) · PRD | 96 | 2026-07-02 | 5 | 0 | 0 | 0 |
| docs/roadmap/ONBOARDING-SPEC.md | Creatrix Onboarding Spec — The First-Launch Ritual | 271 | 2026-06-11 | 0 | 0 | 1 | 0 |
| docs/roadmap/packets/effects-quality.md | Effects-Quality Workstream — Audit + Improvement Packets | 271 | 2026-06-11 | 2 | 3 | 18 | 0 |
| docs/roadmap/packets/masking.md | Work Packets — Selection / Masking / Alpha (MK.1–MK.14 + MK.CU) | 895 | 2026-06-12 | 1 | 0 | 5 | 0 |
| docs/roadmap/packets/parallel-track.md | Work Packets — Parallel Track (v2 debt, schedulable any time, independ | 485 | 2026-06-12 | 1 | 0 | 21 | 0 |
| docs/roadmap/packets/phase-4.md | Phase 4 — PR-C: Operators surfaced + Kentaro Cluster | 912 | 2026-06-11 | 0 | 0 | 7 | 0 |
| docs/roadmap/packets/phase-5a.md | Phase 5a — Instrument build packets (P5a.1 – P5a.15) | 1042 | 2026-06-11 | 7 | 4 | 28 | 0 |
| docs/roadmap/packets/phase-5b.md | Phase 5b Work Packets — Instruments B6→B10 + Gate Cherry-Picks (SG-3 / | 743 | 2026-06-11 | 7 | 0 | 46 | 0 |
| docs/roadmap/packets/phase-6.md | Phase 6 Work Packets — Tier 2b: Field Params + Routing Surfaces | 518 | 2026-06-11 | 7 | 0 | 3 | 0 |
| docs/roadmap/packets/phase-7.md | Phase 7 Work Packets — Tier 5 Latent (HARD-GATED on Q7 REAL verdict) | 665 | 2026-06-11 | 17 | 11 | 93 | 0 |
| docs/roadmap/packets/phase-8-9.md | [LOCKED DECISION 2026-06-11: Tier 7 (P9.*) demoted to IF-EVER, gated o | 638 | 2026-06-11 | 0 | 0 | 89 | 0 |
| docs/roadmap/packets/phase-tier3.md | Tier-3 Work Packets — "Everything Modulates Everything" (B4-full · vis | 445 | 2026-06-11 | 2 | 2 | 46 | 0 |
| docs/roadmap/packets/undo-history.md | Undo/History packets (UH.1 – UH.5) | 223 | 2026-06-11 | 0 | 1 | 3 | 0 |
| docs/roadmap/packets/user-expectations.md | Work Packets — User-Expectation P1 Features (Phase-1-adjacent, schedul | 193 | 2026-06-12 | 0 | 0 | 0 | 0 |
| docs/roadmap/packets/ux-audit.md | Creatrix UX Audit — CDO Industry-15 (Desktop Software / Creative Tools | 342 | 2026-06-11 | 5 | 2 | 2 | 0 |
| docs/roadmap/PERF-MODEL.md | Creatrix Performance Model — The Global Frame Budget | 201 | 2026-06-12 | 0 | 0 | 18 | 0 |
| docs/roadmap/plans/entropic-B2-performance-track-sampler-2026-06-05.md | B2-lite — Performance Track + Sampler instantiation | 58 | 2026-06-11 | 0 | 1 | 0 | 0 |
| docs/roadmap/plans/entropic-creatrix-MASTER-SEQUENCE-2026-06-04.md | Entropic → Creatrix — Master Build Sequence | 484 | 2026-06-11 | 3 | 1 | 4 | 0 |
| docs/roadmap/plans/entropic-history-buffer-validation.md | History Buffer Validation (Round-1 undo follow-up) | 108 | 2026-06-11 | 0 | 0 | 0 | 0 |
| docs/roadmap/plans/entropic-P2-schema-fork-finding.md | P2 FINDING — Backend↔Frontend B4-lite schema fork (✅ RESOLVED 2026-06- | 44 | 2026-06-11 | 0 | 0 | 0 | 0 |
| docs/roadmap/plans/entropic-PR-B-plan-2026-06-05.md | PR-B Implementation Plan | 90 | 2026-06-11 | 5 | 1 | 0 | 0 |
| docs/roadmap/plans/entropic-synth-paradigm-vision.md | Entropic — Wavetable Axes Liberation | 237 | 2026-06-11 | 4 | 0 | 1 | 0 |
| docs/roadmap/ROADMAP.md | Creatrix — Roadmap to Feature-Complete | 375 | 2026-07-02 | 9 | 3 | 10 | 0 |
| docs/roadmap/SELECTION-MASKING-SPEC.md | Creatrix Selection / Masking / Alpha — Workstream Spec | 318 | 2026-06-12 | 8 | 0 | 2 | 0 |
| docs/roadmap/specs/entropic-spec-1-crosswalk.md | SPEC-1 — Vision ↔ Build Crosswalk | 183 | 2026-06-11 | 1 | 0 | 0 | 0 |
| docs/roadmap/specs/entropic-spec-2-b4lite-schema.md | SPEC-2 — B4-lite Schema Injection (INJ-5) | 311 | 2026-06-11 | 0 | 0 | 1 | 0 |
| docs/roadmap/specs/entropic-spec-3-safety-gates.md | SPEC-3 — Safety Gate Contracts (SG-1, SG-3, SG-5, SG-8) | 445 | 2026-06-11 | 1 | 0 | 5 | 0 |
| docs/roadmap/specs/entropic-spec-4-demo-trilogy.md | SPEC-4 — Demo Trilogy (Tier 1 Onboarding Ritual) | 283 | 2026-06-11 | 0 | 0 | 4 | 0 |
| docs/roadmap/specs/entropic-spec-5-l-backbone.md | SPEC-5 — Multi-headed L Backbone Integration Plan | 348 | 2026-06-11 | 1 | 0 | 13 | 0 |
| docs/roadmap/specs/entropic-spec-6-dna-format.md | SPEC-6 — `.dna` Patch Format + No-Regression CI Lint | 496 | 2026-06-11 | 0 | 0 | 15 | 0 |
| docs/roadmap/specs/entropic-spec-7-post-pass.md | SPEC-7 — Post-Pass Items (A4/C4/A5 spectral PRDs + SG-7 codec timeout) | 264 | 2026-06-11 | 0 | 0 | 2 | 0 |
| docs/roadmap/specs/masking-motion-track-spike.md | MK.14 — Motion-Tracked Masks: Spike Report | 274 | 2026-06-14 | 0 | 0 | 1 | 0 |
| openspec/changes/01-per-track-chain-model/design.md | Change 01 — design decisions | 93 | 2026-06-03 | 8 | 0 | 0 | 0 |
| openspec/changes/01-per-track-chain-model/proposal.md | Change 01 — per-track-chain-model | 52 | 2026-06-03 | 1 | 0 | 0 | 0 |
| openspec/changes/01-per-track-chain-model/specs/effect-chain/spec.md | Capability: effect-chain (ownership & mutation) | 79 | 2026-06-03 | 0 | 0 | 0 | 0 |
| openspec/changes/01-per-track-chain-model/tasks.md | Change 01 — implementation tasks | 78 | 2026-06-03 | 7 | 0 | 0 | 0 |
| openspec/changes/02-track-lifecycle-integrity/design.md | Change 1.5 — design decisions | 80 | 2026-06-03 | 6 | 0 | 0 | 0 |
| openspec/changes/02-track-lifecycle-integrity/proposal.md | Change 1.5 — track-lifecycle-integrity (dir: 02-track-lifecycle-integr | 53 | 2026-06-03 | 0 | 0 | 2 | 0 |
| openspec/changes/02-track-lifecycle-integrity/specs/track-lifecycle/spec.md | Capability: track-lifecycle (cross-store integrity) | 65 | 2026-06-03 | 0 | 0 | 0 | 0 |
| openspec/changes/02-track-lifecycle-integrity/tasks.md | Change 1.5 — implementation tasks | 55 | 2026-06-03 | 5 | 0 | 1 | 0 |
| openspec/changes/03-ui-wiring/design.md | Change 02 — design decisions | 98 | 2026-06-03 | 6 | 0 | 0 | 0 |
| openspec/changes/03-ui-wiring/proposal.md | Change 02 — ui-wiring (dir: 03-ui-wiring) | 49 | 2026-06-03 | 1 | 0 | 0 | 0 |
| openspec/changes/03-ui-wiring/specs/effect-chain/spec.md | Capability: effect-chain (UI + render binding) — delta from change 02 | 62 | 2026-06-03 | 0 | 0 | 0 | 0 |
| openspec/changes/03-ui-wiring/tasks.md | Change 02 — implementation tasks | 57 | 2026-06-03 | 6 | 0 | 0 | 0 |
| openspec/changes/04-freeze-pertrack/design.md | Change 03 — design decisions | 35 | 2026-06-03 | 6 | 0 | 0 | 0 |
| openspec/changes/04-freeze-pertrack/proposal.md | Change 03 — freeze-pertrack (dir: 04-freeze-pertrack) — F-0514-16 | 35 | 2026-06-03 | 1 | 0 | 0 | 0 |
| openspec/changes/04-freeze-pertrack/specs/freeze/spec.md | Capability: freeze (per-track) — delta from change 03 | 35 | 2026-06-03 | 0 | 0 | 0 | 0 |
| openspec/changes/04-freeze-pertrack/tasks.md | Change 03 — implementation tasks | 37 | 2026-06-03 | 4 | 0 | 0 | 0 |
| openspec/changes/05-export-pertrack/design.md | Change 04 — design decisions | 46 | 2026-06-03 | 4 | 0 | 0 | 0 |
| openspec/changes/05-export-pertrack/proposal.md | Change 04 — export-pertrack (dir: 05-export-pertrack) | 43 | 2026-06-03 | 0 | 0 | 0 | 0 |
| openspec/changes/05-export-pertrack/specs/export/spec.md | Capability: export (per-track chain) — delta from change 04 | 30 | 2026-06-03 | 0 | 0 | 0 | 0 |
| openspec/changes/05-export-pertrack/specs/render-composite/spec.md | Capability: render-composite (per-layer chains) — delta from change 04 | 25 | 2026-06-03 | 0 | 0 | 0 | 0 |
| openspec/changes/05-export-pertrack/tasks.md | Change 04 — implementation tasks | 35 | 2026-06-03 | 3 | 0 | 0 | 0 |
| openspec/changes/06-persistence-cleanup/design.md | Change 05 — design decisions | 72 | 2026-06-03 | 8 | 0 | 0 | 0 |
| openspec/changes/06-persistence-cleanup/proposal.md | Change 05 — persistence + clean-break cleanup (dir: 06-persistence-cle | 50 | 2026-06-03 | 0 | 0 | 1 | 0 |
| openspec/changes/06-persistence-cleanup/specs/persistence/spec.md | Capability: persistence (per-track chains) — delta from change 05 | 42 | 2026-06-03 | 0 | 0 | 0 | 0 |
| openspec/changes/06-persistence-cleanup/tasks.md | Change 05 — implementation tasks | 46 | 2026-06-03 | 8 | 0 | 0 | 0 |
| openspec/changes/browser-folders/packets.md | Packets — browser-folders | 433 | 2026-07-31 | 6 | 0 | 14 | 0 |
| openspec/changes/browser-folders/plan.md | Plan — browser-folders | 176 | 2026-07-31 | 7 | 1 | 4 | 0 |
| openspec/changes/browser-folders/proposal.md | Change — browser-folders | 172 | 2026-07-04 | 8 | 0 | 0 | 0 |
| openspec/changes/browser-folders/step0-reconciliation.md | W2 Step-0 Reconciliation — the three owner rulings that gate the Rail  | 93 | 2026-07-31 | 4 | 0 | 0 | 0 |
| openspec/changes/browser-folders/uat.md | UAT — browser-folders (Pre-Build) | 173 | 2026-07-04 | 5 | 0 | 3 | 0 |
| openspec/changes/chain-tap-preview/packets.md | Packets — chain-tap-preview | 13 | 2026-07-18 | 1 | 0 | 0 | 0 |
| openspec/changes/chain-tap-preview/plan.md | Plan — chain-tap-preview | 25 | 2026-07-18 | 2 | 0 | 2 | 0 |
| openspec/changes/chain-tap-preview/proposal.md | Proposal — chain-tap-preview (right-click "Preview to here") | 39 | 2026-07-18 | 2 | 0 | 0 | 0 |
| openspec/changes/chain-tap-preview/uat.md | UAT — chain-tap-preview | 11 | 2026-07-18 | 0 | 0 | 0 | 0 |
| openspec/changes/device-monitors-v1/packets.md | Packets — device-monitors-v1 | 44 | 2026-07-18 | 1 | 0 | 0 | 0 |
| openspec/changes/device-monitors-v1/plan.md | Plan — device-monitors-v1 | 83 | 2026-07-18 | 3 | 0 | 4 | 0 |
| openspec/changes/device-monitors-v1/proposal.md | Proposal — device-monitors-v1 (per-device live video monitors + panel  | 87 | 2026-07-18 | 4 | 0 | 0 | 0 |
| openspec/changes/device-monitors-v1/uat.md | UAT — device-monitors-v1 | 23 | 2026-07-18 | 0 | 0 | 0 | 0 |
| openspec/changes/fx-afterimage/packets.md | Packets — fx-afterimage | 419 | 2026-07-04 | 5 | 1 | 8 | 0 |
| openspec/changes/fx-afterimage/plan.md | Plan: fx-afterimage | 468 | 2026-07-04 | 5 | 0 | 8 | 0 |
| openspec/changes/fx-afterimage/proposal.md | Change: fx-afterimage | 260 | 2026-07-04 | 5 | 1 | 1 | 0 |
| openspec/changes/fx-afterimage/uat.md | UAT — fx-afterimage (PRE-BUILD) | 201 | 2026-07-04 | 1 | 0 | 5 | 0 |
| openspec/changes/fx-backspin/packets.md | Packets — fx-backspin | 393 | 2026-07-04 | 5 | 2 | 10 | 0 |
| openspec/changes/fx-backspin/plan.md | Plan — fx.backspin | 247 | 2026-07-04 | 4 | 1 | 7 | 0 |
| openspec/changes/fx-backspin/proposal.md | Proposal — fx.backspin (DJ backspin-on-a-pulse effect) | 165 | 2026-07-04 | 3 | 0 | 0 | 0 |
| openspec/changes/fx-backspin/uat.md | UAT — fx-backspin (PRE-BUILD) | 177 | 2026-07-04 | 2 | 0 | 4 | 0 |
| openspec/changes/history-panel-delta/packets.md | Packets — history-panel-delta | 316 | 2026-07-04 | 5 | 0 | 14 | 0 |
| openspec/changes/history-panel-delta/plan.md | Plan — history-panel-delta | 155 | 2026-07-04 | 5 | 0 | 6 | 0 |
| openspec/changes/history-panel-delta/proposal.md | Change — history-panel-delta | 183 | 2026-07-04 | 6 | 0 | 2 | 0 |
| openspec/changes/history-panel-delta/uat.md | PRE-BUILD UAT — history-panel-delta | 137 | 2026-07-04 | 3 | 2 | 3 | 0 |
| openspec/changes/layertap-matte-v1/packets.md | Packets — layertap-matte-v1 | 573 | 2026-07-04 | 6 | 0 | 23 | 0 |
| openspec/changes/layertap-matte-v1/plan.md | Plan — layertap-matte-v1 | 956 | 2026-07-04 | 6 | 0 | 15 | 0 |
| openspec/changes/layertap-matte-v1/proposal.md | Proposal — layertap-matte-v1 | 172 | 2026-07-04 | 6 | 0 | 0 | 0 |
| openspec/changes/layertap-matte-v1/uat.md | UAT — layertap-matte-v1 (PRE-BUILD) | 149 | 2026-07-04 | 1 | 1 | 14 | 0 |
| openspec/changes/multiwindow-stage-a/packets.md | Packets — multiwindow-stage-a | 408 | 2026-07-04 | 5 | 0 | 74 | 0 |
| openspec/changes/multiwindow-stage-a/plan.md | Plan: multiwindow-stage-a | 206 | 2026-07-04 | 5 | 0 | 27 | 0 |
| openspec/changes/multiwindow-stage-a/proposal.md | Change: multiwindow-stage-a | 147 | 2026-07-04 | 5 | 0 | 5 | 0 |
| openspec/changes/multiwindow-stage-a/uat.md | UAT — multiwindow-stage-a (PRE-BUILD) | 154 | 2026-07-04 | 5 | 0 | 19 | 0 |
| openspec/changes/sampler-clip-editor/packets.md | Packets — sampler-clip-editor | 61 | 2026-07-18 | 3 | 0 | 1 | 0 |
| openspec/changes/sampler-clip-editor/plan.md | Plan — sampler-clip-editor | 117 | 2026-07-18 | 4 | 0 | 2 | 0 |
| openspec/changes/sampler-clip-editor/proposal.md | Proposal — sampler-clip-editor (FrameStrip region/loop editing in the  | 96 | 2026-07-18 | 4 | 0 | 0 | 0 |
| openspec/changes/sampler-clip-editor/uat.md | UAT — sampler-clip-editor | 30 | 2026-07-18 | 0 | 0 | 0 | 0 |
| openspec/changes/system-monitor-v1/packets.md | Packets — system-monitor-v1 | 408 | 2026-07-04 | 5 | 0 | 30 | 0 |
| openspec/changes/system-monitor-v1/plan.md | Plan — system-monitor-v1 | 258 | 2026-07-04 | 3 | 0 | 7 | 0 |
| openspec/changes/system-monitor-v1/proposal.md | Change — system-monitor-v1 | 181 | 2026-07-04 | 4 | 0 | 1 | 0 |
| openspec/changes/system-monitor-v1/uat.md | UAT — system-monitor-v1 (PRE-BUILD) | 172 | 2026-07-04 | 4 | 0 | 5 | 0 |
| openspec/changes/ui-foundation/design-spec.md | Design Spec — ui-foundation | 473 | 2026-07-30 | 8 | 4 | 2 | 0 |
| openspec/changes/ui-foundation/packets.md | Packets — ui-foundation | 546 | 2026-07-31 | 15 | 4 | 4 | 2 |
| openspec/changes/ui-foundation/plan.md | Plan — ui-foundation | 438 | 2026-07-30 | 6 | 0 | 3 | 0 |
| openspec/changes/ui-foundation/proposal.md | Change — ui-foundation | 306 | 2026-07-30 | 14 | 6 | 1 | 0 |
| openspec/changes/ui-foundation/uat.md | PRE-BUILD UAT — ui-foundation | 147 | 2026-07-30 | 6 | 1 | 3 | 0 |
| openspec/changes/util-transform/packets.md | Packets — util-transform | 409 | 2026-07-04 | 4 | 0 | 20 | 0 |
| openspec/changes/util-transform/plan.md | Plan — util-transform | 205 | 2026-07-04 | 4 | 0 | 14 | 0 |
| openspec/changes/util-transform/proposal.md | Change — util-transform | 210 | 2026-07-04 | 4 | 1 | 3 | 0 |
| openspec/changes/util-transform/uat.md | UAT — util-transform (Pre-Build) | 146 | 2026-07-04 | 2 | 0 | 5 | 0 |
| openspec/changes/w15b-grid-track-paradigm/packets.md | W1.5b packets — executor contracts | 239 | 2026-07-31 | 6 | 0 | 1 | 1 |
| openspec/changes/w15b-grid-track-paradigm/proposal.md | W1.5b — Quantize Grid System · Unified Track Paradigm · Automation Clu | 105 | 2026-07-31 | 4 | 1 | 0 | 0 |
| openspec/changes/wave0-prerouted-presets/packets.md | Packets — wave0-prerouted-presets | 101 | 2026-07-04 | 5 | 0 | 3 | 0 |
| openspec/changes/wave0-prerouted-presets/plan.md | Plan — wave0-prerouted-presets | 568 | 2026-07-04 | 1 | 0 | 0 | 0 |
| openspec/changes/wave0-prerouted-presets/proposal.md | Change — wave0-prerouted-presets | 43 | 2026-07-04 | 2 | 0 | 0 | 0 |
| openspec/changes/wave0-prerouted-presets/uat.md | PRE-BUILD UAT — wave0-prerouted-presets | 178 | 2026-07-04 | 0 | 0 | 1 | 0 |
| openspec/DECISIONS-PENDING.md | DECISIONS PENDING — /marathon plan T1 batch (2026-07-03) | 148 | 2026-07-04 | 6 | 1 | 2 | 0 |
| openspec/PLANNING-QUEUE.md | PLANNING QUEUE — /marathon plan, two swimlanes (2026-07-03) | 57 | 2026-07-30 | 8 | 1 | 0 | 0 |
| openspec/project.md | OpenSpec — Creatrix / Entropic v2 | 61 | 2026-06-03 | 1 | 0 | 0 | 0 |
| openspec/READINESS-REPORT-2026-07-04.md | READINESS REPORT — Two-Swimlane Planning Marathon (2026-07-03 → 04) | 45 | 2026-07-30 | 0 | 1 | 0 | 0 |
| docs/frontend/COMPONENT-SPEC.md | COMPONENT-SPEC — the Creatrix component contract | 82 | 2026-07-31 | 3 | 0 | 0 | 1 |
| docs/frontend/FRONTEND-SDLC.md | FRONTEND-SDLC — how a UI change ships | 108 | 2026-07-31 | 1 | 1 | 0 | 0 |
| docs/frontend/LEARNING-PATH.md | LEARNING-PATH — Electron + design-systems fluency for the owner | 68 | 2026-07-30 | 1 | 0 | 0 | 0 |
| docs/frontend/RATIFIED-FOUNDATIONS.md | RATIFIED FOUNDATIONS — Creatrix Frontend | 31 | 2026-07-31 | 19 | 2 | 0 | 4 |
| docs/frontend/RECONCILIATIONS.md | RECONCILIATIONS — cross-lane coherence ledger (A4) | 13 | 2026-07-31 | 4 | 1 | 0 | 0 |
| docs/mockups/INDEX.md | Mockup Registry | 34 | 2026-07-30 | 3 | 2 | 4 | 0 |

### Code citations that do not resolve (runtime paths omitted; `planned?` = line reads like a planned new file)

| doc | line | cite | problem |
|---|---|---|---|
| docs/plans/2026-02-22-phase-0b-pipeline-validation-plan.md | 30 | tool.py | not-in-repo |
| docs/plans/2026-03-15-phase10-freeze-library-plan.md | 106 | frontend/src/renderer/styles/effects.css | not-in-repo:planned? |
| docs/plans/2026-03-15-phase10-freeze-library-plan.md | 132 | phase-10/freeze.spec.ts | not-in-repo |
| docs/plans/2026-03-15-phase10-freeze-library-plan.md | 133 | frontend/tests/e2e/phase-10/freeze.spec.ts | not-in-repo:planned? |
| docs/plans/2026-03-15-phase10-freeze-library-plan.md | 248 | upload/DropZone.tsx | not-in-repo |
| docs/plans/2026-03-15-phase10-freeze-library-plan.md | 262 | phase-10/presets.spec.ts | not-in-repo |
| docs/plans/2026-03-15-phase10-freeze-library-plan.md | 263 | phase-10/presets.spec.ts | not-in-repo |
| docs/plans/2026-03-15-phase10-freeze-library-plan.md | 264 | phase-10/presets.spec.ts | not-in-repo |
| docs/plans/2026-03-15-phase10-freeze-library-plan.md | 265 | frontend/tests/e2e/phase-10/presets.spec.ts | not-in-repo:planned? |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 71 | test_codecs.py | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 72 | test_export_h264.py | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 77 | test_export_resolution.py | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 78 | test_export_fps.py | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 79 | test_export_audio_mux.py | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 80 | test_export_region.py | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 81 | test_export_cancel.py | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 102 | frontend/src/renderer/components/export/ExportDialog.tsx | moved? → frontend/src/renderer/components/dialogs/ExportDialog.tsx |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 133 | export-dialog.test.ts | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 134 | export-dialog.test.ts | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 135 | export-progress.test.ts | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 202 | shortcut-editor.test.ts | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 203 | preferences.test.ts | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 204 | frontend/src/__tests__/components/shortcut-editor.test.ts | not-in-repo:planned? |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 204 | frontend/src/__tests__/components/preferences.test.ts | not-in-repo:planned? |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 244 | Spinner.tsx | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 244 | Skeleton.tsx | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 248 | frontend/src/renderer/components/common/Spinner.tsx | not-in-repo:planned? |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 248 | frontend/src/renderer/components/common/Skeleton.tsx | not-in-repo:planned? |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 258 | ErrorMessage.tsx | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 262 | frontend/src/renderer/components/common/ErrorMessage.tsx | not-in-repo:planned? |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 306 | frontend/src/renderer/styles/polish.css | not-in-repo:planned? |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 311 | welcome-screen.test.ts | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 312 | tooltip.test.ts | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 313 | error-boundary.test.ts | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 314 | spinner.test.ts | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 315 | multi-select.test.ts | not-in-repo |
| docs/plans/2026-03-15-phase11-export-polish-plan.md | 325 | phase-11/multi-select.spec.ts | not-in-repo |
| docs/plans/2026-03-16-feat-ux-redesign-arrangement-view-plan.md | 172 | frontend/src/renderer/components/device-chain/DeviceMix.tsx | not-in-repo |
| docs/plans/2026-03-16-feat-ux-redesign-arrangement-view-plan.md | 173 | frontend/src/renderer/components/device-chain/RenderTimeBar.tsx | not-in-repo |
| docs/plans/2026-03-16-feat-ux-redesign-arrangement-view-plan.md | 295 | frontend/src/renderer/components/device-chain/DeviceGroup.tsx | not-in-repo |
| docs/plans/2026-03-16-feat-ux-redesign-arrangement-view-plan.md | 296 | frontend/src/renderer/components/device-chain/MacroStrip.tsx | not-in-repo |
| docs/plans/2026-03-16-feat-ux-redesign-arrangement-view-plan.md | 360 | frontend/src/renderer/components/timeline/AutomationLane.tsx | moved? → frontend/src/renderer/components/automation/AutomationLane.tsx |
| docs/plans/2026-04-10-phase-next-eng-pickup.md | 229 | export/ExportDialog.tsx | moved? → frontend/src/renderer/components/dialogs/ExportDialog.tsx |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 57 | applyStepGridModulations.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 59 | MacroDevice.tsx | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 59 | applyMacroModulations.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 60 | chord_parser.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 60 | applyChordModulations.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 87 | frontend/src/renderer/components/datamosh/StepGridPanel.tsx | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 88 | frontend/src/renderer/components/performance/applyStepGridModulations.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 95 | test_apply_step_grid_modulations.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 96 | test_step_grid_persistence.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 97 | test_step_grid_midi_learn.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 98 | phase-perf/datamosh-step-grid.spec.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 138 | test_motion_v2_translation.py | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 139 | test_motion_v2_zero_motion.py | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 140 | test_motion_v2_zoom.py | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 141 | test_motion_v2_backward_compat.py | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 142 | tests/oracles/test_video_analyzer_oracle.py | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 151 | test_motion_v2_not_logged.py | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 164 | applyMacroModulations.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 172 | frontend/src/renderer/components/macros/MacroDevice.tsx | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 173 | frontend/src/renderer/components/performance/applyMacroModulations.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 180 | test_apply_macro_modulations.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 181 | test_apply_macro_modulations_clamp.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 182 | test_macro_persistence.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 183 | test_macro_param_remapping.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 184 | phase-ux/macro-device.spec.ts | not-in-repo:planned? |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 187 | chromatic_aberration.sh | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 210 | applyChordModulations.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 218 | frontend/src/renderer/utils/chord_parser.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 219 | frontend/src/renderer/components/performance/applyChordModulations.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 226 | test_chord_parser.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 227 | test_apply_chord_modulations.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 228 | test_chord_persistence.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 229 | test_chord_param_revalidate.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 230 | phase-modulation/chord-modulator.spec.ts | not-in-repo |
| docs/plans/2026-05-04-cross-modal-features-plan.md | 242 | test_webmidi_permission_scoped.ts | not-in-repo |
| docs/plans/2026-05-14-hotkey-discoverability-plan.md | 17 | MenuItem.sh | not-in-repo |
| docs/plans/2026-05-14-hotkey-discoverability-plan.md | 26 | item.sh | not-in-repo |
| docs/plans/2026-05-14-hotkey-discoverability-plan.md | 117 | src/renderer/components/timeline/ContextMenu.test.tsx | not-in-repo |
| docs/plans/2026-05-14-hotkey-discoverability-plan.md | 140 | frontend/src/renderer/components/timeline/__tests__/ContextMenu.test.tsx | not-in-repo |
| docs/plans/2026-05-14-hotkey-discoverability-plan.md | 143 | Track.test.tsx | not-in-repo |
| docs/plans/2026-05-14-hotkey-discoverability-plan.md | 144 | DeviceChain.test.tsx | not-in-repo |
| docs/plans/2026-05-14-hotkey-discoverability-plan.md | 145 | EffectRack.test.tsx | not-in-repo |
| docs/plans/2026-05-15-mount-and-bug-sweep-plan.md | 97 | tests/test_schema_validation.py | not-in-repo |
| docs/plans/2026-05-15-mount-and-bug-sweep-plan.md | 97 | tests/test_phaser.py | not-in-repo |
| docs/plans/2026-05-15-mount-and-bug-sweep-plan.md | 103 | backend/tests/test_project_schema.py | not-in-repo |
| docs/plans/2026-05-15-mount-and-bug-sweep-plan.md | 104 | frontend/src/__tests__/components/timeline/Timeline.test.tsx | not-in-repo |
| docs/plans/2026-06-17-p1b-uat-fix-plan.md | 115 | creatrix-layout.css:70 | not-in-repo:planned? |
| docs/plans/2026-06-17-p1b-uat-fix-plan.md | 119 | creatrix-layout.css | not-in-repo |
| docs/plans/2026-07-02-month-audit-fix-plan.md | 121 | granulator-payload-wiring.test.ts | not-in-repo |
| docs/plans/2026-07-02-month-audit-fix-plan.md | 122 | render-App.tsx | not-in-repo |
| docs/plans/2026-07-02-month-audit-fix-plan.md | 169 | F5/zmq_server.py | moved? → backend/src/zmq_server.py |
| docs/plans/2026-07-03-automation-buildready.md | 52 | automation-bake.ts | not-in-repo:planned? |
| docs/plans/2026-07-03-automation-buildready.md | 73 | AutomationDraw.tsx/automation-record.ts | moved? → frontend/src/renderer/utils/automation-record.ts |
| docs/plans/2026-07-field-mapping/prd/PRD-edge-curve-ui.md | 20 | frontend/.../operators.ts | moved? → frontend/src/renderer/stores/operators.ts |
| docs/plans/2026-07-field-mapping/prd/PRD-mapping-framework.md | 25 | frontend/.../stores/operators.ts | moved? → frontend/src/renderer/stores/operators.ts |
| docs/plans/transitions-pattern.md | 121 | result.sh | not-in-repo |
| docs/plans/transitions-pattern.md | 170 | effects/shared/transitions.py | not-in-repo:planned? |
| docs/plans/transitions-pattern.md | 172 | effects.sh | not-in-repo |
| docs/roadmap/DESIGN-SPEC.md | 115 | tokens.py | not-in-repo |
| docs/roadmap/EXECUTION-PLAN.md | 223 | TransportBar.tsx | not-in-repo |
| docs/roadmap/EXECUTION-PLAN.md | 347 | components/timeline/AutomationLane.tsx | moved? → frontend/src/renderer/components/automation/AutomationLane.tsx |
| docs/roadmap/EXECUTION-PLAN.md | 432 | frontend/src/renderer/components/instruments/InstrumentsPanel.tsx | not-in-repo |
| docs/roadmap/layout-session/B1-1VOICE-SAMPLER-PLAN.md | 116 | frontend/src/renderer/components/browser/InstrumentsTab.tsx | not-in-repo |
| docs/roadmap/layout-session/B1-1VOICE-SAMPLER-PLAN.md | 131 | SamplerDevice.test.tsx | not-in-repo |
| docs/roadmap/layout-session/B1-1VOICE-SAMPLER-PLAN.md | 133 | instruments-sampler-b1.spec.ts | not-in-repo |
| docs/roadmap/layout-session/PLAN.md | 375 | frontend/src/__tests__/e2e/export-snapshot.spec.ts | not-in-repo:planned? |
| docs/roadmap/layout-session/PLAN.md | 423 | backend/tests/modulation/test_cycle_detection.py | moved? → backend/tests/test_q7_benchmark/test_cycle_detection.py |
| docs/roadmap/layout-session/PLAN.md | 501 | backend/src/effects/composite/blend_modes.py | not-in-repo |
| docs/roadmap/layout-session/PLAN.md | 504 | frontend/src/renderer/components/timeline/AutomationLane.tsx | moved? → frontend/src/renderer/components/automation/AutomationLane.tsx |
| docs/roadmap/layout-session/PLAN.md | 505 | frontend/src/renderer/components/timeline/AddAutomationPicker.tsx | not-in-repo:planned? |
| docs/roadmap/layout-session/PLAN.md | 506 | frontend/src/renderer/components/transport/TransportBar.tsx | not-in-repo |
| docs/roadmap/layout-session/PLAN.md | 507 | frontend/src/renderer/components/performance/applyEffectModulations.ts | not-in-repo |
| docs/roadmap/layout-session/PLAN.md | 570 | backend/src/pipeline/operators/kentaro_cluster.py | moved? → backend/src/modulation/kentaro_cluster.py |
| docs/roadmap/layout-session/PLAN.md | 571 | backend/src/pipeline/operators/sidechain.py | moved? → backend/src/modulation/sidechain.py |
| docs/roadmap/layout-session/PLAN.md | 572 | backend/src/pipeline/operators/gate.py | moved? → backend/src/effects/fx/gate.py, backend/src/modulation/gate.py |
| docs/roadmap/layout-session/PLAN.md | 573 | backend/src/pipeline/operators/midi_env_stutter.py | moved? → backend/src/modulation/midi_env_stutter.py |
| docs/roadmap/layout-session/PLAN.md | 574 | backend/src/pipeline/apply_modulations.py | not-in-repo:planned? |
| docs/roadmap/layout-session/PLAN.md | 594 | frontend/src/renderer/components/about/AboutDialog.tsx | moved? → frontend/src/renderer/components/layout/AboutDialog.tsx |
| docs/roadmap/layout-session/PR-INJECTIONS.md | 13 | PadCell/PadEditor/PadGrid.tsx | moved? → frontend/src/renderer/components/performance/PadGrid.tsx |
| docs/roadmap/layout-session/PR-INJECTIONS.md | 93 | applyEffectModulations.ts | not-in-repo |
| docs/roadmap/MISSING-FUNCTIONS-INVENTORY.md | 187 | backend/.../zmq_server.py | moved? → backend/src/zmq_server.py |
| docs/roadmap/ONBOARDING-SPEC.md | 238 | frontend/src/renderer/stores/demos.ts | not-in-repo |
| docs/roadmap/packets/effects-quality.md | 13 | core/real_datamosh.py | not-in-repo |
| docs/roadmap/packets/effects-quality.md | 30 | _oracle.py | not-in-repo |
| docs/roadmap/packets/effects-quality.md | 78 | backend/scripts/contact_sheet.py | not-in-repo:planned? |
| docs/roadmap/packets/effects-quality.md | 78 | backend/tests/test_contact_sheet_harness.py | not-in-repo:planned? |
| docs/roadmap/packets/effects-quality.md | 87 | backend/tests/test_contact_sheet_harness.py | not-in-repo:planned? |
| docs/roadmap/packets/effects-quality.md | 89 | backend/scripts/contact_sheet.py | not-in-repo |
| docs/roadmap/packets/effects-quality.md | 90 | tests/test_contact_sheet_harness.py | not-in-repo |
| docs/roadmap/packets/effects-quality.md | 187 | core/real_datamosh.py | not-in-repo |
| docs/roadmap/packets/effects-quality.md | 197 | real_datamosh.py | not-in-repo |
| docs/roadmap/packets/effects-quality.md | 201 | core/real_datamosh.py | not-in-repo |
| docs/roadmap/packets/masking.md | 696 | backend/src/masking/coverage_tap.py | not-in-repo:planned? |
| docs/roadmap/packets/masking.md | 754 | fal_birefnet.py | not-in-repo |
| docs/roadmap/packets/masking.md | 882 | rvm_local.py | not-in-repo |
| docs/roadmap/packets/parallel-track.md | 138 | frontend/src/renderer/components/preview/RegionSelectOverlay.tsx | not-in-repo:planned? |
| docs/roadmap/packets/parallel-track.md | 393 | audio-drop-zone.test.tsx | not-in-repo |
| docs/roadmap/packets/phase-4.md | 38 | backend/src/pipeline/apply_modulations.py | not-in-repo |
| docs/roadmap/packets/phase-4.md | 48 | operatorLimits.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-4.md | 462 | f.py | not-in-repo |
| docs/roadmap/packets/phase-5a.md | 24 | InstrumentsPanel.tsx | not-in-repo |
| docs/roadmap/packets/phase-5a.md | 25 | InstrumentsPanel.test.tsx | not-in-repo |
| docs/roadmap/packets/phase-5a.md | 41 | InstrumentsPanel.tsx | not-in-repo |
| docs/roadmap/packets/phase-5a.md | 467 | frontend/src/renderer/components/instruments/applySamplerModulations.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-5a.md | 471 | applySamplerModulations.test.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-5a.md | 485 | src/__tests__/components/instruments/applySamplerModulations.test.ts | not-in-repo |
| docs/roadmap/packets/phase-5a.md | 493 | applySamplerModulations.ts | not-in-repo |
| docs/roadmap/packets/phase-5a.md | 580 | melodic-mapping.test.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-5a.md | 593 | src/__tests__/components/instruments/melodic-mapping.test.ts | not-in-repo |
| docs/roadmap/packets/phase-5a.md | 638 | __tests__/stores/rack-host.test.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-5a.md | 654 | src/__tests__/stores/rack-host.test.ts | not-in-repo |
| docs/roadmap/packets/phase-5a.md | 689 | frontend/src/renderer/components/instruments/buildVoiceLayers.ts | not-in-repo |
| docs/roadmap/packets/phase-5a.md | 746 | frontend/src/renderer/components/instruments/applyMacros.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-5a.md | 751 | applyMacros.test.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-5a.md | 765 | src/__tests__/components/instruments/applyMacros.test.ts | not-in-repo |
| docs/roadmap/packets/phase-5a.md | 801 | frontend/src/renderer/components/instruments/computeSlices.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-5a.md | 804 | computeSlices.test.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-5a.md | 804 | tests/test_detect_slices.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-5a.md | 817 | tests/test_detect_slices.py | not-in-repo |
| docs/roadmap/packets/phase-5a.md | 819 | src/__tests__/components/instruments/computeSlices.test.ts | not-in-repo |
| docs/roadmap/packets/phase-5a.md | 856 | frontend/src/renderer/components/instruments/rackTree.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-5a.md | 860 | __tests__/components/instruments/rackTree.test.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-5a.md | 874 | src/__tests__/components/instruments/rackTree.test.ts | not-in-repo |
| docs/roadmap/packets/phase-5a.md | 908 | frontend/src/renderer/components/instruments/rackTree.ts | not-in-repo |
| docs/roadmap/packets/phase-5a.md | 922 | backend/tests/test_subcomposite_render.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-5a.md | 936 | tests/test_subcomposite_render.py | not-in-repo |
| docs/roadmap/packets/phase-5a.md | 973 | backend/tests/test_hierarchical_state_keys.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-5a.md | 987 | tests/test_hierarchical_state_keys.py | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 29 | rife_arch.py | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 29 | engines.py | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 29 | morphlab_core.py | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 214 | tests/test_q7_benchmark/test_routing_graph.py | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 273 | backend/src/instruments/frame_bank.py | moved? → backend/src/engine/frame_bank.py |
| docs/roadmap/packets/phase-5b.md | 273 | backend/tests/test_instruments/test_frame_bank.py | moved? → backend/tests/test_frame_bank.py |
| docs/roadmap/packets/phase-5b.md | 276 | tests/test_instruments/test_frame_bank.py | moved? → backend/tests/test_frame_bank.py |
| docs/roadmap/packets/phase-5b.md | 287 | backend/src/instruments/frame_bank.py | moved? → backend/src/engine/frame_bank.py |
| docs/roadmap/packets/phase-5b.md | 292 | backend/src/instruments/frame_bank.py | moved? → backend/src/engine/frame_bank.py |
| docs/roadmap/packets/phase-5b.md | 295 | tests/test_instruments/test_frame_bank_render.py | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 311 | buildFrameBankLayer.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-5b.md | 314 | src/__tests__/components/instruments/frame-bank.test.tsx | not-in-repo:planned? |
| docs/roadmap/packets/phase-5b.md | 325 | backend/tests/test_instruments/test_frame_bank_determinism.py | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 349 | backend/src/interp/__init__.py | moved? → backend/src/__init__.py, backend/src/audio/__init__.py |
| docs/roadmap/packets/phase-5b.md | 349 | backend/src/interp/rife_arch.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-5b.md | 349 | backend/scripts/export_rife_onnx.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-5b.md | 349 | backend/scripts/measure_rife_memory.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-5b.md | 349 | backend/tests/test_interp/test_rife_arch.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-5b.md | 350 | engines.py | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 351 | rife_arch.py | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 351 | engines.py | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 351 | morphlab_core.py:495 | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 351 | backend/scripts/measure_rife_memory.py | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 352 | tests/test_interp/test_rife_arch.py | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 370 | backend/src/interp/service.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-5b.md | 370 | backend/tests/test_interp/test_service.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-5b.md | 384 | backend/src/interp/service.py | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 389 | backend/src/instruments/frame_bank.py | moved? → backend/src/engine/frame_bank.py |
| docs/roadmap/packets/phase-5b.md | 389 | frontend/.../instruments/FrameBankDevice.tsx | moved? → frontend/src/renderer/components/instruments/FrameBankDevice.tsx |
| docs/roadmap/packets/phase-5b.md | 460 | frontend/.../instruments/GranulatorDevice.tsx | moved? → frontend/src/renderer/components/instruments/GranulatorDevice.tsx |
| docs/roadmap/packets/phase-5b.md | 520 | frontend/.../performance/applyCCModulations.ts | moved? → frontend/src/renderer/components/performance/applyCCModulations.ts |
| docs/roadmap/packets/phase-5b.md | 595 | freeze.ts/performance.ts | moved? → frontend/src/renderer/stores/performance.ts |
| docs/roadmap/packets/phase-5b.md | 628 | backend/src/safety/metal_binding.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-5b.md | 630 | metal_binding.py | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 666 | backend/src/instruments/latent_pool.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-5b.md | 666 | backend/tests/test_instruments/test_latent_selection.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-5b.md | 668 | latent_pool.py | not-in-repo |
| docs/roadmap/packets/phase-5b.md | 669 | tests/test_instruments/test_latent_selection.py | not-in-repo |
| docs/roadmap/packets/phase-6.md | 290 | axis-lanes-payload.test.ts | not-in-repo |
| docs/roadmap/packets/phase-6.md | 389 | test_routing_graph.py | not-in-repo |
| docs/roadmap/packets/phase-6.md | 396 | tests/test_q7_benchmark/test_routing_graph.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 62 | loaders/cache.py | moved? → backend/src/engine/cache.py |
| docs/roadmap/packets/phase-7.md | 64 | backend/src/pipeline/render.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 166 | HOME/.entropic/q7-report.json | not-in-repo |
| docs/roadmap/packets/phase-7.md | 166 | HOME/q7-report.json | not-in-repo |
| docs/roadmap/packets/phase-7.md | 257 | backend/scripts/q7_benchmark/schemas/q7-report.schema.json | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 261 | tests/test_q7_benchmark/test_verdict.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 280 | backend/scripts/q7_benchmark/loaders/dinov2.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 280 | cache_invalidation.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 280 | test_dinov2_lit.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 280 | test_cache_invalidation.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 280 | markdown_report.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 280 | charts.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 284 | test_dinov2_lit.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 298 | loaders/clip.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 298 | test_clip_lit.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 299 | loaders/clap.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 299 | test_clap_lit.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 302 | backend/scripts/q7_benchmark/loaders/clip.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 302 | loaders/clap.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 302 | backend/tests/test_q7_benchmark/test_clip_lit.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 302 | test_clap_lit.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 303 | loaders/dinov2.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 304 | loaders/clip.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 306 | test_clip_lit.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 306 | test_clap_lit.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 306 | tests/test_q7_benchmark/test_clip_lit.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 306 | tests/test_q7_benchmark/test_clap_lit.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 321 | backend/src/q7_worker/__main__.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 321 | dispatcher.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 321 | tests/test_q7_worker.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 322 | tests/test_q7_benchmark/test_q7_worker_stub.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 326 | backend/src/q7_worker/__main__.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 326 | backend/src/q7_worker/dispatcher.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 326 | backend/tests/test_q7_worker.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 326 | backend/tests/test_q7_benchmark/test_q7_worker_stub.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 328 | __main__.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 329 | test_q7_worker_stub.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 330 | tests/test_q7_worker.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 331 | backend/tests/test_q7_worker.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 345 | dispatcher.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 351 | backend/tests/test_sg4_runtime_starvation.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 351 | test_sg4_runtime_isolation.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 351 | backend/src/q7_worker/__main__.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 353 | test_q7_worker.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 355 | tests/test_sg4_runtime_starvation.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 483 | downloadProgressStore.ts | not-in-repo |
| docs/roadmap/packets/phase-7.md | 485 | frontend/src/__tests__/q7/downloadProgressStore.test.ts | not-in-repo |
| docs/roadmap/packets/phase-7.md | 486 | frontend/src/renderer/q7/downloadProgressStore.ts | not-in-repo |
| docs/roadmap/packets/phase-7.md | 489 | frontend/src/renderer/q7/downloadProgressStore.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 489 | frontend/src/renderer/components/perception/ModelDownloadDialog.tsx | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 489 | backend/scripts/q7_benchmark/loaders/cache.py | moved? → backend/src/engine/cache.py |
| docs/roadmap/packets/phase-7.md | 493 | src/__tests__/q7/downloadProgressStore.test.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 493 | frontend/src/__tests__/components/perception/model-download-dialog.test.tsx | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 493 | src/__tests__/components/perception/model-download-dialog.test.tsx | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 493 | downloadProgressStore.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 507 | backend/scripts/spikes/c5_trajectory_spike.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 526 | backend/tests/test_c5_trajectory.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 526 | tests/test_c5_trajectory.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 540 | backend/scripts/spikes/c6_feedback_spike.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 551 | backend/tests/test_c6_feedback_source.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 551 | tests/test_c6_feedback_source.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 569 | backend/tests/test_c8_feedback_through_l.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 569 | tests/test_c8_feedback_through_l.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 580 | backend/scripts/spikes/e1_vae_spike.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 591 | backend/tests/test_e1_training_job.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 591 | tests/test_e1_training_job.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 600 | backend/scripts/spikes/d4_decode_spike.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 614 | backend/scripts/spikes/e6_degrade_spike.py | not-in-repo |
| docs/roadmap/packets/phase-7.md | 621 | backend/tests/test_e6_degrade_policy.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 621 | tests/test_e6_degrade_policy.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-7.md | 649 | test_sg4_runtime_starvation.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 29 | codec.py:39 | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 30 | codec.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 38 | backend/src/dna/codec.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 39 | backend/src/dna/budget.py | moved? → backend/src/safety/pressure/budget.py |
| docs/roadmap/packets/phase-8-9.md | 65 | backend/src/dna/__init__.py | moved? → backend/src/__init__.py, backend/src/audio/__init__.py |
| docs/roadmap/packets/phase-8-9.md | 65 | backend/src/dna/budget.py | moved? → backend/src/safety/pressure/budget.py |
| docs/roadmap/packets/phase-8-9.md | 65 | backend/src/dna/codec.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 65 | backend/tests/test_q7_benchmark/test_dna_format.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 74 | backend/tests/test_q7_benchmark/test_dna_format.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 76 | backend/src/dna/__init__.py | moved? → backend/src/__init__.py, backend/src/audio/__init__.py |
| docs/roadmap/packets/phase-8-9.md | 76 | backend/src/dna/codec.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 76 | backend/src/dna/budget.py | moved? → backend/src/safety/pressure/budget.py |
| docs/roadmap/packets/phase-8-9.md | 76 | backend/tests/test_q7_benchmark/test_dna_format.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 76 | backend/tests/test_dna/test_dna_format.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 78 | backend/tests/test_q7_benchmark/test_dna_format.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 78 | backend/tests/test_dna/test_dna_format.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 84 | tests/test_dna/test_dna_format.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 99 | codec.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 103 | backend/src/dna/codec.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 106 | backend/src/dna/codec.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 106 | backend/tests/test_dna/test_dna_format.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 106 | backend/tests/test_dna/test_dna_header.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 145 | backend/src/dna/budget.py | moved? → backend/src/safety/pressure/budget.py |
| docs/roadmap/packets/phase-8-9.md | 149 | backend/src/dna/budget.py | moved? → backend/src/safety/pressure/budget.py |
| docs/roadmap/packets/phase-8-9.md | 149 | backend/src/dna/validators.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 149 | backend/tests/test_dna/test_budget.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 149 | backend/tests/test_dna/test_validators.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 173 | migrations.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 177 | backend/src/dna/validators.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 181 | backend/src/dna/migrations.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 181 | backend/src/dna/reader.py | moved? → backend/src/video/reader.py |
| docs/roadmap/packets/phase-8-9.md | 181 | backend/src/dna/writer.py | moved? → backend/src/memory/writer.py, backend/src/video/writer.py |
| docs/roadmap/packets/phase-8-9.md | 181 | codec.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 181 | codec.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 181 | backend/tests/test_dna/test_compat.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 182 | make_fixtures.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 203 | scripts/lint_dna_schema.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 213 | backend/src/dna/migrations.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 215 | scripts/lint_dna_schema.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 215 | backend/src/dna/dna_schema.json | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 215 | backend/tests/test_dna/test_lint_rules.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 218 | tests/test_dna/test_lint_rules.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 225 | scripts/lint_dna_schema.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 240 | backend/src/dna/signing.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 244 | backend/src/dna/codec.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 246 | backend/src/dna/signing.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 246 | backend/src/dna/codec.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 246 | backend/tests/test_dna/test_signing.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 265 | backend/src/dna/migrations.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 269 | backend/src/dna/remap.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 269 | backend/tests/test_dna/test_remap.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 272 | tests/test_dna/test_remap.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 290 | PatchImportDialog.tsx | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 295 | backend/src/dna/remap.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 295 | backend/src/dna/validators.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 298 | frontend/src/renderer/components/dna/PatchImportDialog.tsx | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 298 | frontend/src/__tests__/components/dna-import.test.tsx | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 298 | backend/tests/test_dna/test_ipc_import.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 303 | tests/test_dna/test_ipc_import.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 304 | src/__tests__/components/dna-import.test.tsx | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 328 | frontend/src/renderer/components/dna/PatchExportDialog.tsx | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 328 | frontend/src/__tests__/components/dna-export.test.tsx | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 328 | backend/tests/test_dna/test_ipc_export.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 328 | backend/tests/test_dna/test_roundtrip_integration.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 333 | tests/test_dna/test_ipc_export.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 333 | tests/test_dna/test_roundtrip_integration.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 334 | src/__tests__/components/dna-export.test.tsx | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 365 | backend/src/cancellation.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 365 | backend/tests/test_cancellation.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 368 | tests/test_cancellation.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 393 | backend/src/cancellation.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 399 | backend/scripts/genoscope_spike/run_spike.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 440 | backend/src/cancellation.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 509 | backend/scripts/e7_spike/run_all.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 541 | backend/src/plugin_host/quotas.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 545 | backend/src/cancellation.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 548 | backend/tests/test_plugin_host/test_quotas.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-8-9.md | 562 | backend/src/dna/signing.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 562 | backend/src/crypto/ed25519.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 565 | backend/src/dna/signing.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 568 | backend/src/plugin_host/trust.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 585 | backend/src/plugin_host/quotas.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 585 | backend/src/plugin_host/trust.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 588 | backend/src/plugin_host/host.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 588 | plugin.py | not-in-repo |
| docs/roadmap/packets/phase-8-9.md | 625 | codec.py:39 | not-in-repo |
| docs/roadmap/packets/phase-tier3.md | 36 | templates.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 36 | backend/tests/test_q7_benchmark/test_midi_learn.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 80 | backend/src/modulation/binding_kernels.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 87 | backend/src/modulation/binding_kernels.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 89 | binding_kernels.py | not-in-repo |
| docs/roadmap/packets/phase-tier3.md | 94 | backend/src/modulation/binding_kernels.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 99 | backend/tests/test_modulation/test_binding_sampleat.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 102 | tests/test_modulation/test_binding_sampleat.py | not-in-repo |
| docs/roadmap/packets/phase-tier3.md | 114 | backend/src/modulation/binding_kernels.py | not-in-repo |
| docs/roadmap/packets/phase-tier3.md | 119 | binding_kernels.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 119 | backend/tests/test_modulation/test_binding_scanover.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 133 | backend/src/modulation/binding_kernels.py | not-in-repo |
| docs/roadmap/packets/phase-tier3.md | 137 | binding_kernels.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 137 | backend/tests/test_modulation/test_binding_integrate.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 156 | binding_kernels.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 156 | backend/tests/test_modulation/test_binding_painted.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 175 | frontend/src/renderer/components/paint/PaintOverlay.tsx | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 178 | frontend/src/__tests__/components/paint/paint-overlay.test.tsx | not-in-repo |
| docs/roadmap/packets/phase-tier3.md | 200 | backend/tests/test_modulation/test_audio_master_sources.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 219 | backend/tests/test_modulation/test_edge_lag_sh.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 243 | frontend/src/__tests__/components/routing-canvas/matrix-extension.test.tsx | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 265 | frontend/src/renderer/components/performance/applyMacroModulations.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 265 | frontend/src/renderer/stores/macros.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 267 | frontend/src/__tests__/components/performance/apply-macro-modulations.test.ts | not-in-repo |
| docs/roadmap/packets/phase-tier3.md | 283 | frontend/src/renderer/components/macros/MacroDevice.tsx | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 284 | MacroDevice.tsx | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 284 | stores/macros.ts | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 286 | frontend/src/__tests__/components/macros/macro-device.test.tsx | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 310 | backend/src/modulation/render_taps.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 311 | backend/src/modulation/render_taps.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 311 | backend/tests/test_modulation/test_render_taps.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 330 | backend/tests/test_modulation/test_feedback_edges.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 353 | backend/src/midi/__init__.py | moved? → backend/src/__init__.py, backend/src/audio/__init__.py |
| docs/roadmap/packets/phase-tier3.md | 353 | backend/src/midi/registry.py | moved? → backend/src/effects/registry.py, backend/src/inspector/registry.py |
| docs/roadmap/packets/phase-tier3.md | 354 | backend/src/midi/templates.py | not-in-repo |
| docs/roadmap/packets/phase-tier3.md | 354 | backend/tests/test_q7_benchmark/test_midi_learn.py | not-in-repo |
| docs/roadmap/packets/phase-tier3.md | 359 | tests/test_q7_benchmark/test_midi_learn.py | not-in-repo |
| docs/roadmap/packets/phase-tier3.md | 371 | backend/src/midi/registry.py | moved? → backend/src/effects/registry.py, backend/src/inspector/registry.py |
| docs/roadmap/packets/phase-tier3.md | 379 | stores/macros.ts | not-in-repo |
| docs/roadmap/packets/phase-tier3.md | 381 | frontend/src/__tests__/components/performance/midi-template-wiring.test.tsx | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 381 | backend/tests/test_midi/test_template_ipc.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 402 | backend/src/safety/fd_monitor.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 403 | backend/src/safety/fd_monitor.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 403 | backend/tests/test_safety/test_fd_management.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 405 | tests/test_safety/test_fd_management.py | not-in-repo:planned? |
| docs/roadmap/packets/phase-tier3.md | 417 | axis-binding.ts/schema.py | moved? → backend/src/masking/schema.py, backend/src/modulation/schema.py |
| docs/roadmap/packets/undo-history.md | 192 | frontend/src/__tests__/stores/undo-memory-smoke.test.ts | not-in-repo:planned? |
| docs/roadmap/packets/undo-history.md | 193 | src/__tests__/stores/undo-memory-smoke.test.ts | not-in-repo |
| docs/roadmap/packets/undo-history.md | 202 | src/__tests__/stores/undo-memory-smoke.test.ts | not-in-repo |
| docs/roadmap/packets/ux-audit.md | 128 | export/ExportDialog.tsx | moved? → frontend/src/renderer/components/dialogs/ExportDialog.tsx |
| docs/roadmap/PERF-MODEL.md | 141 | backend/scripts/perf_harness/scenes.py | not-in-repo:planned? |
| docs/roadmap/PERF-MODEL.md | 142 | backend/scripts/perf_harness/run_harness.py | not-in-repo:planned? |
| docs/roadmap/PERF-MODEL.md | 142 | docs/perf/frame-budget-baseline.json | not-in-repo:planned? |
| docs/roadmap/PERF-MODEL.md | 143 | run_harness.py | not-in-repo |
| docs/roadmap/PERF-MODEL.md | 144 | backend/tests/test_perf_harness.py | not-in-repo:planned? |
| docs/roadmap/PERF-MODEL.md | 145 | docs/perf/frame-budget-baseline.json | not-in-repo |
| docs/roadmap/PERF-MODEL.md | 151 | tests/test_perf_harness.py | not-in-repo |
| docs/roadmap/PERF-MODEL.md | 152 | scripts/perf_harness/run_harness.py | not-in-repo |
| docs/roadmap/PERF-MODEL.md | 166 | docs/perf/frame-budget-baseline.json | not-in-repo |
| docs/roadmap/PERF-MODEL.md | 170 | run_harness.py | not-in-repo:planned? |
| docs/roadmap/PERF-MODEL.md | 171 | backend/scripts/perf_harness/compare_baseline.py | not-in-repo:planned? |
| docs/roadmap/PERF-MODEL.md | 172 | docs/perf/frame-budget-baseline.ci.json | not-in-repo |
| docs/roadmap/PERF-MODEL.md | 178 | tests/test_compare_baseline.py | not-in-repo |
| docs/roadmap/PERF-MODEL.md | 179 | scripts/perf_harness/compare_baseline.py | not-in-repo |
| docs/roadmap/PERF-MODEL.md | 179 | docs/perf/frame-budget-baseline.json | not-in-repo |
| docs/roadmap/plans/entropic-creatrix-MASTER-SEQUENCE-2026-06-04.md | 424 | InstrumentsPanel.tsx | not-in-repo:planned? |
| docs/roadmap/plans/entropic-synth-paradigm-vision.md | 65 | core/automation.py | not-in-repo |
| docs/roadmap/ROADMAP.md | 374 | app.py:348 | not-in-repo |
| docs/roadmap/ROADMAP.md | 374 | mutation_engine.py:559 | not-in-repo |
| docs/roadmap/SELECTION-MASKING-SPEC.md | 57 | rvm_local.py:11 | not-in-repo |
| docs/roadmap/specs/entropic-spec-2-b4lite-schema.md | 179 | frontend/src/renderer/components/performance/applyEffectModulations.ts | not-in-repo |
| docs/roadmap/specs/entropic-spec-3-safety-gates.md | 68 | backend/tests/gpu/test_resource_lifetime.py | not-in-repo |
| docs/roadmap/specs/entropic-spec-3-safety-gates.md | 117 | backend/src/pipeline/latent_sentinel.py | moved? → backend/src/safety/latent_sentinel.py |
| docs/roadmap/specs/entropic-spec-3-safety-gates.md | 142 | backend/src/pipeline/render.py | not-in-repo |
| docs/roadmap/specs/entropic-spec-3-safety-gates.md | 239 | backend/src/pipeline/render.py | not-in-repo |
| docs/roadmap/specs/entropic-spec-3-safety-gates.md | 320 | backend/src/perception/memory_monitor.py | not-in-repo |
| docs/roadmap/specs/entropic-spec-4-demo-trilogy.md | 228 | frontend/src/renderer/components/browser/DemosTab.tsx | not-in-repo:planned? |
| docs/roadmap/specs/entropic-spec-4-demo-trilogy.md | 229 | frontend/src/renderer/components/demos/FirstLaunchOverlay.tsx | not-in-repo:planned? |
| docs/roadmap/specs/entropic-spec-4-demo-trilogy.md | 230 | frontend/src/renderer/stores/demos.ts | not-in-repo:planned? |
| docs/roadmap/specs/entropic-spec-4-demo-trilogy.md | 233 | frontend/src/renderer/components/preview/PaintLayer.tsx | not-in-repo:planned? |
| docs/roadmap/specs/entropic-spec-5-l-backbone.md | 105 | backend/src/perception/l_backbone_client.py | not-in-repo |
| docs/roadmap/specs/entropic-spec-5-l-backbone.md | 290 | backend/src/perception/__init__.py | moved? → backend/src/__init__.py, backend/src/audio/__init__.py |
| docs/roadmap/specs/entropic-spec-5-l-backbone.md | 291 | backend/src/perception/l_backbone_client.py | not-in-repo:planned? |
| docs/roadmap/specs/entropic-spec-5-l-backbone.md | 292 | backend/src/perception/l_backbone_worker.py | not-in-repo:planned? |
| docs/roadmap/specs/entropic-spec-5-l-backbone.md | 293 | backend/src/perception/inference_backends/mlx_backend.py | not-in-repo |
| docs/roadmap/specs/entropic-spec-5-l-backbone.md | 294 | backend/src/perception/inference_backends/pytorch_mps_backend.py | not-in-repo |
| docs/roadmap/specs/entropic-spec-5-l-backbone.md | 295 | backend/src/perception/inference_backends/pytorch_cpu_backend.py | not-in-repo |
| docs/roadmap/specs/entropic-spec-5-l-backbone.md | 296 | backend/src/perception/model_registry.py | not-in-repo |
| docs/roadmap/specs/entropic-spec-5-l-backbone.md | 297 | backend/src/perception/model_downloader.py | not-in-repo |
| docs/roadmap/specs/entropic-spec-5-l-backbone.md | 298 | backend/src/perception/memory_monitor.py | not-in-repo |
| docs/roadmap/specs/entropic-spec-5-l-backbone.md | 299 | backend/src/pipeline/render.py | not-in-repo |
| docs/roadmap/specs/entropic-spec-5-l-backbone.md | 300 | frontend/src/renderer/components/perception/ModelDownloadDialog.tsx | not-in-repo |
| docs/roadmap/specs/entropic-spec-5-l-backbone.md | 301 | frontend/src/renderer/components/statusbar/PerceptionStatus.tsx | not-in-repo |
| docs/roadmap/specs/entropic-spec-6-dna-format.md | 101 | e2.sh | not-in-repo |
| docs/roadmap/specs/entropic-spec-6-dna-format.md | 275 | scripts/lint_dna_schema.py | not-in-repo |
| docs/roadmap/specs/entropic-spec-6-dna-format.md | 335 | backend/src/dna/format.py | not-in-repo:planned? |
| docs/roadmap/specs/entropic-spec-6-dna-format.md | 336 | backend/src/dna/schema.py | moved? → backend/src/masking/schema.py, backend/src/modulation/schema.py |
| docs/roadmap/specs/entropic-spec-6-dna-format.md | 337 | backend/src/dna/reader.py | moved? → backend/src/video/reader.py |
| docs/roadmap/specs/entropic-spec-6-dna-format.md | 338 | backend/src/dna/writer.py | moved? → backend/src/memory/writer.py, backend/src/video/writer.py |
| docs/roadmap/specs/entropic-spec-6-dna-format.md | 339 | backend/src/dna/migrations.py | not-in-repo:planned? |
| docs/roadmap/specs/entropic-spec-6-dna-format.md | 340 | backend/src/dna/validators.py | not-in-repo:planned? |
| docs/roadmap/specs/entropic-spec-6-dna-format.md | 341 | backend/src/dna/signing.py | not-in-repo:planned? |
| docs/roadmap/specs/entropic-spec-6-dna-format.md | 342 | backend/src/dna/dna_schema.json | not-in-repo:planned? |
| docs/roadmap/specs/entropic-spec-6-dna-format.md | 343 | frontend/src/renderer/components/dna/PatchImportDialog.tsx | not-in-repo:planned? |
| docs/roadmap/specs/entropic-spec-6-dna-format.md | 344 | frontend/src/renderer/components/dna/PatchExportDialog.tsx | not-in-repo:planned? |
| docs/roadmap/specs/entropic-spec-6-dna-format.md | 345 | scripts/lint_dna_schema.py | not-in-repo:planned? |
| docs/roadmap/specs/entropic-spec-7-post-pass.md | 138 | backend/src/instruments/granular_spectral.py | not-in-repo |
| docs/roadmap/specs/entropic-spec-7-post-pass.md | 138 | granular_video.py | not-in-repo |
| docs/roadmap/specs/masking-motion-track-spike.md | 163 | backend/src/masking/motion_track.py | not-in-repo:planned? |
| openspec/changes/02-track-lifecycle-integrity/proposal.md | 5 | tiger-repro.test.ts | not-in-repo |
| openspec/changes/02-track-lifecycle-integrity/proposal.md | 44 | tiger-repro.test.ts | not-in-repo |
| openspec/changes/02-track-lifecycle-integrity/tasks.md | 36 | frontend/src/__tests__/stores/tiger-repro.test.ts | not-in-repo |
| openspec/changes/06-persistence-cleanup/proposal.md | 47 | limits.ts/freeze.ts | moved? → frontend/src/renderer/stores/freeze.ts |
| openspec/changes/browser-folders/packets.md | 51 | frontend/src/renderer/stores/browser-migration.ts | not-in-repo:planned? |
| openspec/changes/browser-folders/packets.md | 60 | frontend/src/__tests__/stores/browser-migration.test.ts | not-in-repo:planned? |
| openspec/changes/browser-folders/packets.md | 74 | stores/browser-tree.ts | not-in-repo:planned? |
| openspec/changes/browser-folders/packets.md | 82 | frontend/src/renderer/stores/browser-tree.ts | not-in-repo:planned? |
| openspec/changes/browser-folders/packets.md | 90 | frontend/src/renderer/stores/browser-tree.ts | not-in-repo |
| openspec/changes/browser-folders/packets.md | 93 | frontend/src/__tests__/stores/browser-tree.test.ts | not-in-repo:planned? |
| openspec/changes/browser-folders/packets.md | 118 | frontend/src/renderer/components/browser/BrowserRail.tsx | not-in-repo:planned? |
| openspec/changes/browser-folders/packets.md | 119 | frontend/src/renderer/components/browser/BrowserDrawer.tsx | not-in-repo |
| openspec/changes/browser-folders/packets.md | 134 | frontend/src/__tests__/components/browser/browser-rail.test.tsx | not-in-repo |
| openspec/changes/browser-folders/packets.md | 135 | browser-drawer.test.tsx | not-in-repo |
| openspec/changes/browser-folders/packets.md | 207 | frontend/src/renderer/components/browser/BrowserSearch.tsx | not-in-repo:planned? |
| openspec/changes/browser-folders/packets.md | 219 | frontend/src/__tests__/components/browser/browser-search.test.tsx | not-in-repo |
| openspec/changes/browser-folders/packets.md | 402 | frontend/src/renderer/components/browser/BrowserRail.tsx | not-in-repo:planned? |
| openspec/changes/browser-folders/packets.md | 402 | BrowserDrawer.tsx | not-in-repo:planned? |
| openspec/changes/browser-folders/plan.md | 123 | stores/browser-tree.ts | not-in-repo:planned? |
| openspec/changes/browser-folders/plan.md | 124 | components/browser/BrowserRail.tsx | not-in-repo:planned? |
| openspec/changes/browser-folders/plan.md | 124 | BrowserDrawer.tsx | not-in-repo:planned? |
| openspec/changes/browser-folders/plan.md | 140 | stores/browser-tree.ts | not-in-repo |
| openspec/changes/browser-folders/uat.md | 40 | src/__tests__/stores/browser-migration.test.ts | not-in-repo |
| openspec/changes/browser-folders/uat.md | 49 | src/__tests__/stores/browser-tree.test.ts | not-in-repo |
| openspec/changes/browser-folders/uat.md | 50 | frontend/src/renderer/stores/browser-tree.ts | not-in-repo |
| openspec/changes/chain-tap-preview/plan.md | 22 | panels/MonitorPanel.tsx | not-in-repo |
| openspec/changes/chain-tap-preview/plan.md | 24 | operators.ts/routing.py | moved? → backend/src/masking/routing.py, backend/src/modulation/routing.py |
| openspec/changes/device-monitors-v1/plan.md | 7 | frontend/src/renderer/panels/registry.ts | not-in-repo |
| openspec/changes/device-monitors-v1/plan.md | 47 | panels/MonitorPanel.tsx | not-in-repo |
| openspec/changes/device-monitors-v1/plan.md | 68 | panels/registry.ts | not-in-repo:planned? |
| openspec/changes/device-monitors-v1/plan.md | 68 | panels/MonitorPanel.tsx | not-in-repo:planned? |
| openspec/changes/fx-afterimage/packets.md | 71 | backend/tests/test_afterimage.py | not-in-repo |
| openspec/changes/fx-afterimage/packets.md | 168 | backend/tests/test_afterimage.py | not-in-repo:planned? |
| openspec/changes/fx-afterimage/packets.md | 186 | backend/tests/test_afterimage.py | not-in-repo:planned? |
| openspec/changes/fx-afterimage/packets.md | 192 | tests/test_afterimage.py | not-in-repo |
| openspec/changes/fx-afterimage/packets.md | 194 | tests/test_afterimage.py | not-in-repo |
| openspec/changes/fx-afterimage/packets.md | 240 | test_afterimage.py | not-in-repo |
| openspec/changes/fx-afterimage/packets.md | 293 | fx.copy_machine.py | not-in-repo |
| openspec/changes/fx-afterimage/packets.md | 357 | backend/tests/test_afterimage.py | not-in-repo:planned? |
| openspec/changes/fx-afterimage/plan.md | 26 | backend/tests/test_afterimage.py | not-in-repo:planned? |
| openspec/changes/fx-afterimage/plan.md | 100 | fx.copy_machine.py | not-in-repo |
| openspec/changes/fx-afterimage/plan.md | 205 | backend/tests/test_afterimage.py | not-in-repo:planned? |
| openspec/changes/fx-afterimage/plan.md | 254 | echo_line.sh | not-in-repo |
| openspec/changes/fx-afterimage/plan.md | 266 | backend/tests/test_afterimage.py | not-in-repo |
| openspec/changes/fx-afterimage/plan.md | 423 | tests/test_afterimage.py | not-in-repo:planned? |
| openspec/changes/fx-afterimage/plan.md | 424 | backend/tests/test_afterimage.py | not-in-repo:planned? |
| openspec/changes/fx-afterimage/plan.md | 439 | fx.copy_machine.py | not-in-repo |
| openspec/changes/fx-afterimage/proposal.md | 161 | backend/tests/test_afterimage.py | not-in-repo |
| openspec/changes/fx-afterimage/uat.md | 98 | backend/tests/test_afterimage.py | not-in-repo:planned? |
| openspec/changes/fx-afterimage/uat.md | 106 | tests/test_afterimage.py | not-in-repo |
| openspec/changes/fx-afterimage/uat.md | 107 | tests/test_afterimage.py | not-in-repo |
| openspec/changes/fx-afterimage/uat.md | 108 | tests/test_afterimage.py | not-in-repo |
| openspec/changes/fx-afterimage/uat.md | 109 | backend/tests/test_afterimage.py | not-in-repo |
| openspec/changes/fx-backspin/packets.md | 38 | backend/src/effects/fx/backspin.py | not-in-repo |
| openspec/changes/fx-backspin/packets.md | 52 | container.py/pipeline.py | moved? → backend/src/engine/pipeline.py |
| openspec/changes/fx-backspin/packets.md | 56 | backend/src/effects/fx/backspin.py | not-in-repo:planned? |
| openspec/changes/fx-backspin/packets.md | 58 | backend/tests/test_effects/test_backspin.py | not-in-repo:planned? |
| openspec/changes/fx-backspin/packets.md | 67 | tests/test_effects/test_backspin.py | not-in-repo |
| openspec/changes/fx-backspin/packets.md | 93 | backend/tests/test_effects/test_backspin.py | not-in-repo |
| openspec/changes/fx-backspin/packets.md | 120 | backspin.py | not-in-repo |
| openspec/changes/fx-backspin/packets.md | 159 | backend/tests/test_engine/test_synthetic_params.py | not-in-repo |
| openspec/changes/fx-backspin/packets.md | 231 | AutomationToolbar.test.tsx | not-in-repo |
| openspec/changes/fx-backspin/packets.md | 293 | frontend/src/renderer/components/device-chain/backspin-preset-cascade.test.tsx | not-in-repo |
| openspec/changes/fx-backspin/plan.md | 47 | backend/src/effects/fx/backspin.py | not-in-repo:planned? |
| openspec/changes/fx-backspin/plan.md | 124 | backspin.py | not-in-repo |
| openspec/changes/fx-backspin/plan.md | 158 | backend/tests/test_effects/test_backspin.py | not-in-repo:planned? |
| openspec/changes/fx-backspin/plan.md | 212 | DeviceChain.test.tsx | not-in-repo:planned? |
| openspec/changes/fx-backspin/plan.md | 212 | backspin-preset-cascade.test.tsx | not-in-repo:planned? |
| openspec/changes/fx-backspin/plan.md | 237 | backend/src/effects/fx/backspin.py | not-in-repo:planned? |
| openspec/changes/fx-backspin/plan.md | 237 | test_backspin.py | not-in-repo:planned? |
| openspec/changes/fx-backspin/uat.md | 47 | tests/test_effects/test_backspin.py | not-in-repo |
| openspec/changes/fx-backspin/uat.md | 52 | tests/test_effects/test_backspin.py | not-in-repo |
| openspec/changes/fx-backspin/uat.md | 53 | tests/test_effects/test_backspin.py | not-in-repo |
| openspec/changes/fx-backspin/uat.md | 62 | backend/tests/test_engine/test_synthetic_params.py | not-in-repo:planned? |
| openspec/changes/history-panel-delta/packets.md | 64 | src/__tests__/components/history-breadcrumb-chip.test.tsx | not-in-repo |
| openspec/changes/history-panel-delta/packets.md | 73 | frontend/src/__tests__/components/history-breadcrumb-chip.test.tsx | not-in-repo |
| openspec/changes/history-panel-delta/packets.md | 101 | src/__tests__/components/history-panel-dock-persistence.test.tsx | not-in-repo |
| openspec/changes/history-panel-delta/packets.md | 110 | frontend/src/__tests__/components/history-panel-dock-persistence.test.tsx | not-in-repo |
| openspec/changes/history-panel-delta/packets.md | 144 | frontend/src/__tests__/stores/ledger-lint.test.ts | not-in-repo |
| openspec/changes/history-panel-delta/packets.md | 179 | history-op-class.ts | not-in-repo:planned? |
| openspec/changes/history-panel-delta/packets.md | 181 | frontend/src/renderer/utils/history-op-class.ts | not-in-repo |
| openspec/changes/history-panel-delta/packets.md | 200 | frontend/src/renderer/utils/history-op-class.ts | not-in-repo |
| openspec/changes/history-panel-delta/packets.md | 206 | src/__tests__/utils/history-op-class.test.ts | not-in-repo |
| openspec/changes/history-panel-delta/packets.md | 218 | frontend/src/__tests__/utils/history-op-class.test.ts | not-in-repo:planned? |
| openspec/changes/history-panel-delta/packets.md | 248 | frontend/src/__tests__/perf/history-memory-smoke.test.ts | not-in-repo |
| openspec/changes/history-panel-delta/packets.md | 259 | frontend/src/__tests__/perf/history-memory-smoke.test.ts | not-in-repo:planned? |
| openspec/changes/history-panel-delta/packets.md | 265 | src/__tests__/perf/history-memory-smoke.test.ts | not-in-repo |
| openspec/changes/history-panel-delta/packets.md | 285 | ledger-lint.test.ts | not-in-repo |
| openspec/changes/history-panel-delta/plan.md | 63 | frontend/src/renderer/utils/history-op-class.ts | not-in-repo:planned? |
| openspec/changes/history-panel-delta/plan.md | 65 | frontend/src/__tests__/perf/history-memory-smoke.test.ts | not-in-repo:planned? |
| openspec/changes/history-panel-delta/plan.md | 75 | ledger-lint.test.ts | not-in-repo:planned? |
| openspec/changes/history-panel-delta/plan.md | 76 | history-op-class.ts | not-in-repo:planned? |
| openspec/changes/history-panel-delta/plan.md | 77 | history-memory-smoke.test.ts | not-in-repo:planned? |
| openspec/changes/history-panel-delta/plan.md | 90 | frontend/src/__tests__/utils/history-op-class.test.ts | not-in-repo |
| openspec/changes/history-panel-delta/proposal.md | 74 | persistence.ts | not-in-repo |
| openspec/changes/history-panel-delta/proposal.md | 158 | ledger-lint.test.ts | not-in-repo:planned? |
| openspec/changes/history-panel-delta/uat.md | 73 | frontend/src/__tests__/stores/ledger-lint.test.ts | not-in-repo:planned? |
| openspec/changes/history-panel-delta/uat.md | 97 | history-memory-smoke.test.ts | not-in-repo |
| openspec/changes/history-panel-delta/uat.md | 98 | src/__tests__/perf/history-memory-smoke.test.ts | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 82 | backend/tests/test_masking_layer_tap_schema.py | not-in-repo:planned? |
| openspec/changes/layertap-matte-v1/packets.md | 101 | test_masking_layer_tap_schema.py | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 139 | backend/src/masking/tap_cache.py | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 148 | backend/tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 157 | test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 172 | test_layer_tap_composite.py | not-in-repo:planned? |
| openspec/changes/layertap-matte-v1/packets.md | 217 | masking/tap_dependency.py | not-in-repo:planned? |
| openspec/changes/layertap-matte-v1/packets.md | 218 | test_layer_tap_composite.py | not-in-repo:planned? |
| openspec/changes/layertap-matte-v1/packets.md | 219 | backend/tests/test_layer_tap_post_order.py | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 229 | test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 250 | test_layer_tap_post_order.py | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 257 | test_layer_tap_post_order.py | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 288 | backend/tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 319 | test_layer_tap_composite.py | not-in-repo:planned? |
| openspec/changes/layertap-matte-v1/packets.md | 360 | test_layer_tap_composite.py | not-in-repo:planned? |
| openspec/changes/layertap-matte-v1/packets.md | 390 | test_layer_tap_composite.py | not-in-repo:planned? |
| openspec/changes/layertap-matte-v1/packets.md | 391 | frontend/src/__tests__/MaskStackPanel.layertap.test.tsx | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 410 | MaskStackPanel.layertap.test.tsx | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 451 | frontend/src/__tests__/MaskStackPanel.layertap.test.tsx | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 460 | MaskStackPanel.layertap.test.tsx | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 473 | MaskStackPanel.layertap.test.tsx | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 529 | frontend/src/__tests__/MaskStackPanel.layertap.test.tsx | not-in-repo |
| openspec/changes/layertap-matte-v1/packets.md | 530 | backend/tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/plan.md | 415 | backend/tests/test_masking_layer_tap_schema.py | not-in-repo:planned? |
| openspec/changes/layertap-matte-v1/plan.md | 436 | backend/src/masking/tap_cache.py | not-in-repo |
| openspec/changes/layertap-matte-v1/plan.md | 490 | backend/tests/test_layer_tap_composite.py | not-in-repo:planned? |
| openspec/changes/layertap-matte-v1/plan.md | 565 | masking/tap_dependency.py | not-in-repo:planned? |
| openspec/changes/layertap-matte-v1/plan.md | 576 | backend/tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/plan.md | 612 | backend/tests/test_layer_tap_post_order.py | not-in-repo:planned? |
| openspec/changes/layertap-matte-v1/plan.md | 640 | backend/tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/plan.md | 683 | backend/tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/plan.md | 722 | backend/tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/plan.md | 766 | backend/tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/plan.md | 773 | frontend/src/__tests__/MaskStackPanel.layertap.test.tsx | not-in-repo |
| openspec/changes/layertap-matte-v1/plan.md | 847 | frontend/src/__tests__/MaskStackPanel.layertap.test.tsx | not-in-repo:planned? |
| openspec/changes/layertap-matte-v1/plan.md | 883 | masking/tap_dependency.py | not-in-repo |
| openspec/changes/layertap-matte-v1/plan.md | 886 | test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/plan.md | 905 | MaskStackPanel.layertap.test.tsx | not-in-repo |
| openspec/changes/layertap-matte-v1/uat.md | 50 | tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/uat.md | 51 | tests/test_layer_tap_composite.py | not-in-repo:planned? |
| openspec/changes/layertap-matte-v1/uat.md | 52 | tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/uat.md | 58 | tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/uat.md | 59 | tests/test_layer_tap_post_order.py | not-in-repo |
| openspec/changes/layertap-matte-v1/uat.md | 59 | test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/uat.md | 60 | tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/uat.md | 61 | tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/uat.md | 67 | tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/uat.md | 75 | tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/uat.md | 76 | tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/uat.md | 77 | tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/uat.md | 83 | tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/layertap-matte-v1/uat.md | 89 | tests/test_layer_tap_composite.py | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 26 | preload/monitor.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 28 | SystemMonitorStub.tsx | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 45 | window-bounds.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 47 | preload/monitor.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 49 | monitor-entry.tsx | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 49 | SystemMonitorStub.tsx | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 62 | frontend/src/main/window-manager.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/packets.md | 62 | frontend/src/main/window-bounds.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/packets.md | 63 | frontend/src/preload/monitor.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 64 | frontend/src/renderer/monitor-entry.tsx | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 65 | frontend/src/renderer/components/monitor/SystemMonitorStub.tsx | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 66 | frontend/src/__tests__/main/window-manager.test.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 67 | frontend/src/__tests__/main/window-bounds.test.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 67 | frontend/src/__tests__/main/zmq-relay-fifo.test.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 68 | frontend/tests/e2e/multiwindow/window-lifecycle.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 69 | frontend/tests/e2e/multiwindow/sidecar-restart-survival.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 73 | window-bounds.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 74 | window-bounds.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 85 | src/__tests__/main/window-manager.test.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 92 | src/__tests__/main/window-bounds.test.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 100 | tests/e2e/multiwindow/window-lifecycle.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 105 | src/__tests__/main/zmq-relay-fifo.test.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/packets.md | 111 | window-manager.test.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 111 | window-bounds.test.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 113 | window-lifecycle.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 114 | sidecar-restart-survival.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 124 | window-bounds.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 134 | preload/monitor.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 143 | frontend/src/main/panel-bridge.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 147 | stores/freeze-undo.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/packets.md | 150 | SystemMonitorStub.tsx | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 161 | frontend/src/main/panel-bridge.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/packets.md | 161 | frontend/src/renderer/stores/freeze-undo.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/packets.md | 162 | frontend/src/__tests__/main/panel-bridge.test.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 163 | frontend/src/__tests__/stores/freeze-undo.test.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 164 | frontend/tests/e2e/multiwindow/undo-forwarding.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 168 | frontend/src/renderer/components/monitor/SystemMonitorStub.tsx | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 171 | preload/monitor.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 186 | src/__tests__/main/panel-bridge.test.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 189 | undo-forwarding.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 194 | panel-bridge.test.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 194 | freeze-undo.test.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 198 | undo-forwarding.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 200 | panel-bridge.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 219 | panel-bridge.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 229 | panel-bridge.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 230 | freeze-undo.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 238 | SystemMonitorPanel.tsx | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/packets.md | 252 | frontend/src/renderer/components/monitor/SystemMonitorPanel.tsx | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/packets.md | 253 | frontend/src/__tests__/components/system-monitor-panel.test.tsx | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 254 | frontend/tests/e2e/multiwindow/reattach.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 254 | frontend/tests/e2e/multiwindow/relaunch-restore.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 269 | reattach.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 272 | relaunch-restore.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 280 | system-monitor-panel.test.tsx | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 283 | reattach.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 283 | relaunch-restore.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 308 | frontend/tests/e2e/multiwindow/focus-routing.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 317 | frontend/tests/e2e/multiwindow/focus-routing.spec.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/packets.md | 325 | tests/e2e/multiwindow/focus-routing.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 356 | frontend/src/renderer/components/monitor/SystemMonitorStub.tsx | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/packets.md | 360 | window-manager.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 360 | window-bounds.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 360 | preload/monitor.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 361 | monitor-entry.tsx | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 361 | panel-bridge.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 361 | freeze-undo.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 362 | SystemMonitorPanel.tsx | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 371 | window-bounds.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/packets.md | 377 | preload/monitor.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/plan.md | 53 | frontend/src/main/window-bounds.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/plan.md | 83 | frontend/src/main/window-manager.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/plan.md | 97 | preload/monitor.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/plan.md | 101 | preload/monitor.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/plan.md | 122 | frontend/src/main/window-manager.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/plan.md | 122 | frontend/src/main/window-bounds.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/plan.md | 122 | frontend/src/preload/monitor.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/plan.md | 122 | frontend/src/renderer/monitor-entry.tsx | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/plan.md | 122 | frontend/src/renderer/components/monitor/SystemMonitorStub.tsx | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/plan.md | 122 | window-bounds.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/plan.md | 122 | frontend/src/__tests__/main/window-manager.test.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/plan.md | 123 | frontend/src/main/panel-bridge.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/plan.md | 124 | frontend/src/renderer/components/monitor/SystemMonitorPanel.tsx | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/plan.md | 125 | frontend/tests/e2e/multiwindow/focus-routing.spec.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/plan.md | 150 | window-manager.test.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/plan.md | 154 | window-bounds.test.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/plan.md | 158 | panel-bridge.test.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/proposal.md | 22 | frontend/src/preload/monitor.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/proposal.md | 23 | frontend/src/renderer/monitor-entry.tsx | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/proposal.md | 113 | preload/monitor.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/proposal.md | 114 | renderer/monitor-entry.tsx | not-in-repo |
| openspec/changes/multiwindow-stage-a/uat.md | 48 | src/__tests__/main/window-manager.test.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/uat.md | 49 | src/__tests__/main/window-bounds.test.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/uat.md | 50 | window-bounds.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/uat.md | 51 | tests/e2e/multiwindow/window-lifecycle.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/uat.md | 52 | tests/e2e/multiwindow/sidecar-restart-survival.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/uat.md | 53 | src/__tests__/main/zmq-relay-fifo.test.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/uat.md | 54 | window-manager.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/uat.md | 60 | SystemMonitorStub.tsx | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/uat.md | 70 | src/__tests__/stores/freeze-undo.test.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/uat.md | 71 | src/__tests__/main/panel-bridge.test.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/uat.md | 72 | panel-bridge.ts | not-in-repo:planned? |
| openspec/changes/multiwindow-stage-a/uat.md | 73 | tests/e2e/multiwindow/undo-forwarding.spec.ts | not-in-repo |
| openspec/changes/multiwindow-stage-a/uat.md | 108 | tests/e2e/multiwindow/focus-routing.spec.ts | not-in-repo:planned? |
| openspec/changes/sampler-clip-editor/packets.md | 24 | shared/FrameStrip.tsx | not-in-repo |
| openspec/changes/sampler-clip-editor/plan.md | 7 | frontend/src/renderer/components/shared/FrameStrip.tsx | not-in-repo |
| openspec/changes/sampler-clip-editor/plan.md | 112 | shared/FrameStrip.tsx | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/packets.md | 29 | backend/modulation/routing.py | moved? → backend/src/masking/routing.py, backend/src/modulation/routing.py |
| openspec/changes/system-monitor-v1/packets.md | 34 | preload/monitor.ts | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 36 | system-monitor-window.ts | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 38 | preload/monitor.ts | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 40 | monitor-entry.tsx | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 40 | SystemMonitorStub.tsx | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 76 | backend/tests/test_engine/test_perf_stats.py | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 91 | test_perf_stats.py | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/packets.md | 128 | backend/src/engine/frame_ring.py | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/packets.md | 133 | backend/tests/test_engine/test_slow_frame_log.py | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 137 | backend/tests/test_diagnostics/test_crash_last_frames.py | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 141 | test_slow_frame_log.py | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/packets.md | 141 | test_crash_last_frames.py | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/packets.md | 162 | frontend/src/renderer/components/statusbar/SystemMeters.tsx | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/packets.md | 172 | frontend/src/__tests__/components/statusbar/system-meters.test.tsx | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 179 | system-meters.test.tsx | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/packets.md | 233 | SystemMonitorPanel.tsx | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 256 | SystemMonitorPanel.tsx | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/packets.md | 271 | frontend/src/__tests__/components/system-monitor/system-monitor-panel.test.tsx | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/packets.md | 283 | system-monitor-panel.test.tsx | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/packets.md | 308 | frontend/src/main/system-monitor-window.ts | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/packets.md | 311 | system-monitor-entry.tsx | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 324 | frontend/src/main/system-monitor-window.ts | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/packets.md | 325 | system-monitor-entry.tsx | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 332 | frontend/src/__tests__/main/system-monitor-window.test.ts | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 351 | frontend/src/__tests__/main/system-monitor-window.test.ts | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 363 | frontend/src/main/window-manager.ts | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 363 | frontend/src/preload/monitor.ts | not-in-repo |
| openspec/changes/system-monitor-v1/packets.md | 382 | backend/modulation/routing.py | moved? → backend/src/masking/routing.py, backend/src/modulation/routing.py |
| openspec/changes/system-monitor-v1/plan.md | 111 | frontend/src/renderer/components/statusbar/SystemMeters.tsx | not-in-repo |
| openspec/changes/system-monitor-v1/plan.md | 151 | frontend/src/renderer/components/system-monitor/SystemMonitorPanel.tsx | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/plan.md | 174 | frontend/src/main/system-monitor-window.ts | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/plan.md | 174 | system-monitor-entry.tsx | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/plan.md | 220 | components/statusbar/system-meters.test.tsx | not-in-repo |
| openspec/changes/system-monitor-v1/plan.md | 227 | components/system-monitor/system-monitor-panel.test.tsx | not-in-repo |
| openspec/changes/system-monitor-v1/proposal.md | 83 | system-monitor-entry.tsx | not-in-repo |
| openspec/changes/system-monitor-v1/uat.md | 59 | test_slow_frame_log.py | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/uat.md | 59 | test_crash_last_frames.py | not-in-repo:planned? |
| openspec/changes/system-monitor-v1/uat.md | 117 | preload/monitor.ts | not-in-repo |
| openspec/changes/system-monitor-v1/uat.md | 119 | monitor-entry.tsx | not-in-repo |
| openspec/changes/system-monitor-v1/uat.md | 120 | system-monitor-window.ts | not-in-repo |
| openspec/changes/ui-foundation/design-spec.md | 410 | frontend/scripts/type-histogram-guard.sh | not-in-repo:planned? |
| openspec/changes/ui-foundation/design-spec.md | 442 | frontend/src/__tests__/tool-rail.test.tsx | moved? → frontend/src/__tests__/components/layout/tool-rail.test.tsx |
| openspec/changes/ui-foundation/packets.md | 89 | frontend/scripts/type-histogram-guard.sh | not-in-repo:planned? |
| openspec/changes/ui-foundation/packets.md | 93 | frontend/scripts/type-histogram-guard.sh | not-in-repo:planned? |
| openspec/changes/ui-foundation/packets.md | 130 | frontend/src/__tests__/tool-rail.test.tsx | moved? → frontend/src/__tests__/components/layout/tool-rail.test.tsx |
| openspec/changes/ui-foundation/packets.md | 305 | AutomationToolbar.test.tsx | not-in-repo:planned? |
| openspec/changes/ui-foundation/plan.md | 54 | b3-layout.css | not-in-repo |
| openspec/changes/ui-foundation/plan.md | 104 | frontend/src/__tests__/tool-rail.test.tsx | moved? → frontend/src/__tests__/components/layout/tool-rail.test.tsx |
| openspec/changes/ui-foundation/plan.md | 374 | frontend/src/__tests__/tool-rail.test.tsx | moved? → frontend/src/__tests__/components/layout/tool-rail.test.tsx |
| openspec/changes/ui-foundation/uat.md | 65 | src/__tests__/tool-rail.test.tsx | moved? → frontend/src/__tests__/components/layout/tool-rail.test.tsx |
| openspec/changes/ui-foundation/uat.md | 77 | AutomationToolbar.test.tsx | not-in-repo |
| openspec/changes/ui-foundation/uat.md | 140 | frontend/scripts/type-histogram-guard.sh | not-in-repo |
| openspec/changes/util-transform/packets.md | 56 | backend/src/effects/util/transform.py | not-in-repo:planned? |
| openspec/changes/util-transform/packets.md | 68 | transform.py | not-in-repo |
| openspec/changes/util-transform/packets.md | 77 | backend/src/effects/util/transform.py | not-in-repo:planned? |
| openspec/changes/util-transform/packets.md | 82 | backend/tests/test_effects/test_util/test_transform.py | not-in-repo:planned? |
| openspec/changes/util-transform/packets.md | 88 | tests/test_effects/test_util/test_transform.py | not-in-repo |
| openspec/changes/util-transform/packets.md | 103 | backend/tests/test_effects/test_util/test_transform.py | not-in-repo |
| openspec/changes/util-transform/packets.md | 104 | frame.sh | not-in-repo |
| openspec/changes/util-transform/packets.md | 137 | backend/src/effects/util/transform.py | not-in-repo |
| openspec/changes/util-transform/packets.md | 139 | backend/tests/test_effects/test_util/test_transform.py | not-in-repo:planned? |
| openspec/changes/util-transform/packets.md | 143 | transform.py | not-in-repo |
| openspec/changes/util-transform/packets.md | 149 | tests/test_effects/test_util/test_transform.py | not-in-repo |
| openspec/changes/util-transform/packets.md | 201 | frontend/src/__tests__/components/preview/bounding-box-overlay.test.tsx | not-in-repo:planned? |
| openspec/changes/util-transform/packets.md | 213 | src/__tests__/components/preview/bounding-box-overlay.test.tsx | not-in-repo |
| openspec/changes/util-transform/packets.md | 233 | frontend/src/__tests__/components/preview/bounding-box-overlay.test.tsx | not-in-repo |
| openspec/changes/util-transform/packets.md | 272 | frontend/src/__tests__/app/util-transform-gizmo-mount.test.tsx | not-in-repo |
| openspec/changes/util-transform/packets.md | 285 | src/__tests__/app/util-transform-gizmo-mount.test.tsx | not-in-repo |
| openspec/changes/util-transform/packets.md | 324 | frontend/src/renderer/utils/affine-gesture-group.ts | not-in-repo:planned? |
| openspec/changes/util-transform/packets.md | 332 | frontend/src/renderer/utils/affine-gesture-group.test.ts | not-in-repo |
| openspec/changes/util-transform/packets.md | 371 | backend/src/effects/util/transform.py | not-in-repo |
| openspec/changes/util-transform/packets.md | 372 | backend/tests/test_effects/test_util/test_transform.py | not-in-repo |
| openspec/changes/util-transform/plan.md | 10 | backend/src/effects/util/transform.py | not-in-repo:planned? |
| openspec/changes/util-transform/plan.md | 40 | frame.sh | not-in-repo |
| openspec/changes/util-transform/plan.md | 49 | transform.py | not-in-repo |
| openspec/changes/util-transform/plan.md | 83 | e.sh | not-in-repo |
| openspec/changes/util-transform/plan.md | 114 | frontend/src/renderer/utils/affine-gesture-group.ts | not-in-repo:planned? |
| openspec/changes/util-transform/plan.md | 131 | backend/src/effects/util/transform.py | not-in-repo:planned? |
| openspec/changes/util-transform/plan.md | 131 | tests/test_effects/test_util/test_transform.py | not-in-repo:planned? |
| openspec/changes/util-transform/plan.md | 132 | transform.py | not-in-repo |
| openspec/changes/util-transform/plan.md | 133 | frontend/src/__tests__/components/preview/bounding-box-overlay.test.tsx | not-in-repo:planned? |
| openspec/changes/util-transform/plan.md | 133 | src/__tests__/components/preview/bounding-box-overlay.test.tsx | not-in-repo:planned? |
| openspec/changes/util-transform/plan.md | 135 | affine-gesture-group.ts | not-in-repo:planned? |
| openspec/changes/util-transform/plan.md | 146 | backend/tests/test_effects/test_util/test_transform.py | not-in-repo |
| openspec/changes/util-transform/plan.md | 159 | transform.py | not-in-repo |
| openspec/changes/util-transform/plan.md | 173 | bounding-box-overlay.test.tsx | not-in-repo:planned? |
| openspec/changes/util-transform/proposal.md | 126 | backend/src/effects/util/transform.py | not-in-repo |
| openspec/changes/util-transform/proposal.md | 191 | backend/src/effects/util/transform.py | not-in-repo:planned? |
| openspec/changes/util-transform/proposal.md | 197 | backend/tests/test_effects/test_util/test_transform.py | not-in-repo |
| openspec/changes/util-transform/uat.md | 34 | transform.py | not-in-repo:planned? |
| openspec/changes/util-transform/uat.md | 40 | tests/test_effects/test_util/test_transform.py | not-in-repo |
| openspec/changes/util-transform/uat.md | 42 | tests/test_effects/test_util/test_transform.py | not-in-repo |
| openspec/changes/util-transform/uat.md | 49 | tests/test_effects/test_util/test_transform.py | not-in-repo |
| openspec/changes/util-transform/uat.md | 50 | tests/test_effects/test_util/test_transform.py | not-in-repo |
| openspec/changes/w15b-grid-track-paradigm/packets.md | 181 | record.ts | not-in-repo |
| openspec/changes/wave0-prerouted-presets/packets.md | 19 | frontend/src/__tests__/stores/ledger-lint.test.ts | not-in-repo:planned? |
| openspec/changes/wave0-prerouted-presets/packets.md | 33 | tests/test_modulation/test_instance_addressing.py | not-in-repo:planned? |
| openspec/changes/wave0-prerouted-presets/packets.md | 51 | backend/scripts/render_preset_thumbs.py | not-in-repo:planned? |
| openspec/changes/wave0-prerouted-presets/uat.md | 54 | src/__tests__/stores/ledger-lint.test.ts | not-in-repo |
| openspec/DECISIONS-PENDING.md | 96 | preload/monitor.ts | not-in-repo |
| openspec/DECISIONS-PENDING.md | 96 | monitor-entry.tsx | not-in-repo |
| docs/mockups/INDEX.md | 18 | SystemMeters.tsx | not-in-repo:planned? |
| docs/mockups/INDEX.md | 18 | system-monitor-window.ts | not-in-repo:planned? |
| docs/mockups/INDEX.md | 20 | shared/FrameStrip.tsx | not-in-repo:planned? |
| docs/mockups/INDEX.md | 20 | panels/MonitorPanel.tsx | not-in-repo:planned? |

### Test-ids cited in docs but absent from code

| doc | line | testid |
|---|---|---|
| docs/plans/2026-03-16-feat-ux-redesign-arrangement-view-plan.md | 557 | data-testid |
| openspec/changes/ui-foundation/packets.md | 155 | data-testid |
| openspec/changes/ui-foundation/packets.md | 312 | data-testid |
| openspec/changes/w15b-grid-track-paradigm/packets.md | 185 | overdub-toggle |
| docs/frontend/COMPONENT-SPEC.md | 28 | data-testid |
| docs/frontend/RATIFIED-FOUNDATIONS.md | 23 | write-replace |
| docs/frontend/RATIFIED-FOUNDATIONS.md | 23 | write-overdub |
| docs/frontend/RATIFIED-FOUNDATIONS.md | 23 | write-add |
| docs/frontend/RATIFIED-FOUNDATIONS.md | 23 | overdub-toggle |
