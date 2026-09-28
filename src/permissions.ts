import * as Location from 'expo-location';
// Existing request flow is retained for phase 1; explainer/decline flow arrives in phase 3.
export const requestForegroundLocationPermission = () => Location.requestForegroundPermissionsAsync();
export const requestBackgroundLocationPermission = () => Location.requestBackgroundPermissionsAsync();
