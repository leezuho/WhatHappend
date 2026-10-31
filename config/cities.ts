// Cities for the air-quality strip (Open-Meteo, one call for all).

export interface City {
  key: string;
  en: string;
  vi: string;
  lat: number;
  lng: number;
}

export const CITIES: City[] = [
  { key: "hanoi", en: "Hanoi", vi: "Hà Nội", lat: 21.0285, lng: 105.8542 },
  { key: "hcmc", en: "Ho Chi Minh City", vi: "TP.HCM", lat: 10.8231, lng: 106.6297 },
  { key: "beijing", en: "Beijing", vi: "Bắc Kinh", lat: 39.9042, lng: 116.4074 },
  { key: "delhi", en: "Delhi", vi: "New Delhi", lat: 28.6139, lng: 77.209 },
  { key: "jakarta", en: "Jakarta", vi: "Jakarta", lat: -6.2088, lng: 106.8456 },
  { key: "bangkok", en: "Bangkok", vi: "Bangkok", lat: 13.7563, lng: 100.5018 },
  { key: "tokyo", en: "Tokyo", vi: "Tokyo", lat: 35.6762, lng: 139.6503 },
  { key: "newyork", en: "New York", vi: "New York", lat: 40.7128, lng: -74.006 },
  { key: "london", en: "London", vi: "London", lat: 51.5074, lng: -0.1278 },
  { key: "lagos", en: "Lagos", vi: "Lagos", lat: 6.5244, lng: 3.3792 },
];
