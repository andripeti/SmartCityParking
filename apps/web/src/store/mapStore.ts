import { create } from "zustand";

interface MapState {
  center: [number, number];
  zoom: number;
  selectedZoneId: number | null;
  selectedBayId: number | null;
  showZones: boolean;
  showBays: boolean;
  showSensors: boolean;
  showTerminals: boolean;
  showViolations: boolean;
  showHeatmap: boolean;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setSelectedZone: (id: number | null) => void;
  setSelectedBay: (id: number | null) => void;
  toggleLayer: (layer: keyof MapState) => void;
}

export const useMapStore = create<MapState>()((set) => ({
  // Default center: Vienna, Austria (Stephansplatz)
  center: [16.3738, 48.2082],
  zoom: 14,
  selectedZoneId: null,
  selectedBayId: null,
  showZones: true,
  showBays: true,
  showSensors: false,
  showTerminals: false,
  showViolations: false,
  showHeatmap: false,

  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setSelectedZone: (id) => set({ selectedZoneId: id }),
  setSelectedBay: (id) => set({ selectedBayId: id }),
  toggleLayer: (layer) => set((state) => ({ [layer]: !state[layer] })),
}));
