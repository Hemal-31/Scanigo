import L from "leaflet";

/**
 * Free map tile providers for Leaflet with zero API key requirements.
 * - 'pastel': OSM Humanitarian (HOT) – soft pastel palette matching modern transit UI.
 * - 'streets': Esri World Street Map – crisp road geometry and street navigation.
 * - 'osm': Standard OpenStreetMap as resilient fallback.
 */
export const TILE_PROVIDERS = {
  pastel: {
    name: "Pastel Transit",
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      subdomains: ["a", "b", "c"],
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  streets: {
    name: "Navigation Streets",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri",
    },
  },
  osm: {
    name: "Standard OSM",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    },
  },
};

/**
 * Attaches a styled, free tile layer to any Leaflet map instance with automatic fallback on network errors.
 */
export function addStyledTileLayer(map, providerKey = "pastel") {
  const provider = TILE_PROVIDERS[providerKey] || TILE_PROVIDERS.pastel;
  const layer = L.tileLayer(provider.url, {
    ...provider.options,
    crossOrigin: true,
  });

  // Resilient fallback on tile load failure
  layer.on("tileerror", (error) => {
    if (providerKey !== "osm") {
      try {
        error.tile.src = `https://tile.openstreetmap.org/${error.coords.z}/${error.coords.x}/${error.coords.y}.png`;
      } catch {
        // Silent fallback failover
      }
    }
  });

  layer.addTo(map);
  return layer;
}
