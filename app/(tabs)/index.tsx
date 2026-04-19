import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

type GooglePlace = {
  name: string;
  primaryType?: string;
  formattedAddress?: string;
};

type PlacesApiResponse = {
  places?: {
    displayName?: { text?: string };
    primaryType?: string;
    formattedAddress?: string;
  }[];
};

type GoogleAutocompleteResponse = {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: {
        text?: string;
      };
      structuredFormat?: {
        mainText?: {
          text?: string;
        };
        secondaryText?: {
          text?: string;
        };
      };
    };
  }[];
};

type GooglePlaceDetailsResponse = {
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  addressComponents?: {
    longText?: string;
    types?: string[];
  }[];
};

type HomePrediction = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText?: string;
};

type HomeDestination = {
  name: string;
  addressLine1: string;
  addressLine2?: string;
  latitude?: number;
  longitude?: number;
};

const SEARCH_RADIUS_METERS = 300;
const GEOCODE_INTERVAL_MS = 60_000;
const HOME_DESTINATION_STORAGE_KEY = 'polarys_home_destination';

const FRILEY = {
  name: 'Friley Hall',
  latitude: 42.0237,
  longitude: -93.6466,
  radius: 200,
  address: '212 Beyer Ct, Ames, IA 50012',
};

const MARY_GREELEY = {
  name: 'Mary Greeley Medical Center',
  latitude: 42.0226,
  longitude: -93.609,
  address: '1111 Duff Ave, Ames, IA 50010',
};

const CONTACT_NAME = 'Papa';
const CONTACT_NUMBER = 'tel:9909922260';
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return earthRadiusMeters * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function friendlyType(type?: string) {
  if (!type) return 'Unknown';
  if (type.includes('bar') || type.includes('night_club')) return 'Bar';
  if (type.includes('restaurant')) return 'Restaurant';
  if (type.includes('hospital')) return 'Hospital';
  if (type.includes('university')) return 'Campus';
  if (type.includes('lodging')) return 'Housing';
  return type.replace(/_/g, ' ');
}

function isRiskyPlace(primaryType?: string, name?: string): boolean {
  const type = primaryType?.toLowerCase() ?? '';
  const lowerName = name?.toLowerCase() ?? '';

  const riskyTypes = ['bar', 'night_club', 'liquor_store'];
  if (riskyTypes.some((t) => type.includes(t))) return true;

  const fraternityKeywords = ['fraternity', 'frat', 'sorority', 'greek house', 'chapter house'];
  if (fraternityKeywords.some((kw) => lowerName.includes(kw))) return true;

  const greekLetters = [
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
    'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho',
    'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  ];
  const wordCount = greekLetters.filter((letter) => lowerName.includes(letter)).length;
  if (wordCount >= 2) return true;

  return false;
}

function openQuickCheckDialog(
  nextStateName: string | null,
  onGetUber: () => void,
  onGetHospital: () => void,
  onCallContact: () => void
) {
  Alert.alert('Quick Check', `${nextStateName ?? 'This area'}: Safe to drive?`, [
    { text: 'Get Uber', onPress: onGetUber },
    { text: 'Nearest Hospital', onPress: onGetHospital },
    { text: `Call ${CONTACT_NAME}`, onPress: onCallContact },
    { text: "I'll Wait", style: 'cancel' },
  ]);
}

export default function HomeScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [stateName, setStateName] = useState<string | null>(null);
  const [matchedPlace, setMatchedPlace] = useState<GooglePlace | null>(null);
  const [placeTypeLabel, setPlaceTypeLabel] = useState<string | null>(null);
  const [distanceToFriley, setDistanceToFriley] = useState<number | null>(null);
  const [isInFrileyZone, setIsInFrileyZone] = useState(false);
  const [frileyElapsedSeconds, setFrileyElapsedSeconds] = useState(0);
  const [isInRiskZone, setIsInRiskZone] = useState(false);
  const [homeDestination, setHomeDestination] = useState<HomeDestination>({
    name: FRILEY.name,
    addressLine1: FRILEY.name,
    addressLine2: FRILEY.address,
    latitude: FRILEY.latitude,
    longitude: FRILEY.longitude,
  });
  const [homeQuery, setHomeQuery] = useState('');
  const [isSettingHome, setIsSettingHome] = useState(false);
  const [homePredictions, setHomePredictions] = useState<HomePrediction[]>([]);
  const [isLoadingPredictions, setIsLoadingPredictions] = useState(false);
  const [showPredictions, setShowPredictions] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hasShownQuickCheckRef = useRef(false);
  const lastGeocodeTimeRef = useRef(0);
  const latestStateNameRef = useRef<string | null>(null);
  const latestLocationRef = useRef<Location.LocationObject | null>(null);
  const frileyEnteredAtRef = useRef<number | null>(null);
  const predictionRequestIdRef = useRef(0);

  const openUrl = async (primaryUrl: string, fallbackUrl?: string) => {
    try {
      await Linking.openURL(primaryUrl);
    } catch {
      if (fallbackUrl) {
        await Linking.openURL(fallbackUrl);
        return;
      }
      setErrorMsg('Unable to open link.');
    }
  };

  const openUberToAddress = async (currentLocation?: Location.LocationObject | null) => {
    const pickup = encodeURIComponent(
      JSON.stringify({
        latitude: currentLocation?.coords.latitude,
        longitude: currentLocation?.coords.longitude,
        addressLine1: 'Current Location',
      })
    );

    const dropoff = encodeURIComponent(
      JSON.stringify({
        latitude: homeDestination.latitude,
        longitude: homeDestination.longitude,
        addressLine1: homeDestination.addressLine1,
        addressLine2: homeDestination.addressLine2,
      })
    );

    const appUrl = `uber://?action=setPickup&pickup=${pickup}&drop[0]=${dropoff}`;
    const webUrl = `https://m.uber.com/looking?pickup=${pickup}&drop[0]=${dropoff}`;

    await openUrl(appUrl, webUrl);
  };

  const setHomeToCurrentLocation = async () => {
    const currentLocation = latestLocationRef.current ?? location;

    if (!currentLocation) {
      setErrorMsg('Current location unavailable. Move once, then try setting home again.');
      return;
    }

    try {
      const addresses = await Location.reverseGeocodeAsync(currentLocation.coords);
      const firstAddress = addresses[0];

      const line1 =
        [firstAddress?.streetNumber, firstAddress?.street].filter(Boolean).join(' ').trim() ||
        firstAddress?.name ||
        'Pinned Home';
      const line2 =
        [
          firstAddress?.city ?? firstAddress?.district ?? firstAddress?.subregion,
          firstAddress?.region,
          firstAddress?.postalCode,
        ]
          .filter(Boolean)
          .join(', ') || undefined;

      const nextHome: HomeDestination = {
        name: 'Home',
        addressLine1: line1,
        addressLine2: line2,
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      };

      setHomeDestination(nextHome);
      await AsyncStorage.setItem(HOME_DESTINATION_STORAGE_KEY, JSON.stringify(nextHome));
      setErrorMsg(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setErrorMsg(`Failed to set home: ${message}`);
    }
  };

  const setHomeByTypedAddress = async () => {
    const query = homeQuery.trim();

    if (!query) {
      setErrorMsg('Type your home address first.');
      return;
    }

    if (!GOOGLE_API_KEY) {
      setErrorMsg('Missing Google Maps API key.');
      return;
    }

    try {
      setIsSettingHome(true);
      const predictions = await fetchHomePredictions(query);

      if (predictions.length === 0) {
        setErrorMsg('No address match found. Try a more specific address.');
        return;
      }

      await setHomeByPlaceId(predictions[0].placeId, predictions[0].description);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setErrorMsg(`Failed to set home by address: ${message}`);
    } finally {
      setIsSettingHome(false);
    }
  };

  const setHomeByPlaceId = async (placeId: string, fallbackDescription: string) => {
    if (!GOOGLE_API_KEY) {
      setErrorMsg('Missing Google Maps API key.');
      return;
    }

    try {
      setIsSettingHome(true);
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_API_KEY,
            'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Place details failed with status ${response.status}`);
      }

      const data = (await response.json()) as GooglePlaceDetailsResponse;
      const lat = data.location?.latitude;
      const lng = data.location?.longitude;

      if (lat === undefined || lng === undefined) {
        throw new Error('No coordinates returned for that place.');
      }

      const components = data.addressComponents ?? [];
      const byType = (type: string) =>
        components.find((component) => component.types?.includes(type))?.longText;

      const line1 =
        [byType('street_number'), byType('route')].filter(Boolean).join(' ').trim() ||
        data.formattedAddress ||
        fallbackDescription;
      const line2 =
        [
          byType('locality') ?? byType('sublocality'),
          byType('administrative_area_level_1'),
          byType('postal_code'),
        ]
          .filter(Boolean)
          .join(', ') || undefined;

      const nextHome: HomeDestination = {
        name: 'Home',
        addressLine1: line1,
        addressLine2: line2,
        latitude: lat,
        longitude: lng,
      };

      setHomeDestination(nextHome);
      await AsyncStorage.setItem(HOME_DESTINATION_STORAGE_KEY, JSON.stringify(nextHome));
      setErrorMsg(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setErrorMsg(`Failed to set home by place: ${message}`);
    } finally {
      setIsSettingHome(false);
    }
  };

  const selectHomePrediction = async (prediction: HomePrediction) => {
    setHomeQuery(prediction.description);
    setShowPredictions(false);
    setHomePredictions([]);
    await setHomeByPlaceId(prediction.placeId, prediction.description);
  };

  const goToNearestHospital = async () => {
    const mapsUrl =
      'https://www.google.com/maps/dir/?api=1' +
      `&destination=${MARY_GREELEY.latitude},${MARY_GREELEY.longitude}` +
      '&travelmode=driving';

    const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${MARY_GREELEY.name}, ${MARY_GREELEY.address}`
    )}`;

    setErrorMsg(null);
    await openUrl(mapsUrl, fallbackUrl);
  };

  const callEmergencyContact = async () => {
    await openUrl(CONTACT_NUMBER);
  };

  const openUberToAddressRef = useRef(openUberToAddress);
  const goToNearestHospitalRef = useRef(goToNearestHospital);
  const callEmergencyContactRef = useRef(callEmergencyContact);

  openUberToAddressRef.current = openUberToAddress;
  goToNearestHospitalRef.current = goToNearestHospital;
  callEmergencyContactRef.current = callEmergencyContact;

  const showQuickCheck = (
    nextStateName: string | null = latestStateNameRef.current,
    currentLocation: Location.LocationObject | null = latestLocationRef.current
  ) => {
    openQuickCheckDialog(
      nextStateName,
      () => void openUberToAddress(currentLocation),
      () => void goToNearestHospital(),
      () => void callEmergencyContact()
    );
  };

  const fetchHomePredictions = async (query: string): Promise<HomePrediction[]> => {
    if (!GOOGLE_API_KEY) {
      return [];
    }

    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask':
          'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text',
      },
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ['us'],
        languageCode: 'en',
      }),
    });

    if (!response.ok) {
      throw new Error(`Autocomplete failed with status ${response.status}`);
    }

    const data = (await response.json()) as GoogleAutocompleteResponse;

    return (data.suggestions ?? [])
      .map((suggestion) => suggestion.placePrediction)
      .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction?.placeId))
      .slice(0, 5)
      .map((prediction) => ({
        placeId: prediction.placeId as string,
        description: prediction.text?.text ?? '',
        mainText: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? '',
        secondaryText: prediction.structuredFormat?.secondaryText?.text,
      }))
      .filter((prediction) => prediction.description);
  };

  const fetchNearbyPlace = async (lat: number, lon: number) => {
    if (!GOOGLE_API_KEY) {
      setMatchedPlace(null);
      setPlaceTypeLabel(null);
      return null;
    }

    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.primaryType,places.formattedAddress',
        },
        body: JSON.stringify({
          maxResultCount: 3,
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lon },
              radius: SEARCH_RADIUS_METERS,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Places lookup failed with status ${response.status}`);
      }

      const data = (await response.json()) as PlacesApiResponse;
      const candidate = data.places?.find((place) => place.displayName?.text);

      if (!candidate?.displayName?.text) {
        setMatchedPlace(null);
        setPlaceTypeLabel(null);
        return null;
      }

      const place: GooglePlace = {
        name: candidate.displayName.text,
        primaryType: candidate.primaryType,
        formattedAddress: candidate.formattedAddress,
      };

      setMatchedPlace(place);
      setPlaceTypeLabel(friendlyType(candidate.primaryType));
      return place;
    } catch (error) {
      setMatchedPlace(null);
      setPlaceTypeLabel(null);
      const message = error instanceof Error ? error.message : 'Unknown error';
      setErrorMsg(message);
      return null;
    }
  };

  useEffect(() => {
    latestStateNameRef.current = stateName;
  }, [stateName]);

  useEffect(() => {
    latestLocationRef.current = location;
  }, [location]);

  useEffect(() => {
    const query = homeQuery.trim();

    if (!GOOGLE_API_KEY || query.length < 3) {
      setHomePredictions([]);
      setIsLoadingPredictions(false);
      return;
    }

    const requestId = ++predictionRequestIdRef.current;
    const timeoutId = setTimeout(async () => {
      try {
        setIsLoadingPredictions(true);
        const nextPredictions = await fetchHomePredictions(query);

        if (predictionRequestIdRef.current === requestId) {
          setHomePredictions(nextPredictions);
          setErrorMsg(null);
        }
      } catch (error) {
        if (predictionRequestIdRef.current === requestId) {
          setHomePredictions([]);
          const message = error instanceof Error ? error.message : 'Unknown error';
          setErrorMsg(`Autocomplete unavailable: ${message}`);
        }
      } finally {
        if (predictionRequestIdRef.current === requestId) {
          setIsLoadingPredictions(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [homeQuery]);

  useEffect(() => {
    let isMounted = true;

    const loadSavedHome = async () => {
      try {
        const savedValue = await AsyncStorage.getItem(HOME_DESTINATION_STORAGE_KEY);
        if (!savedValue || !isMounted) return;

        const parsed = JSON.parse(savedValue) as Partial<HomeDestination>;
        if (typeof parsed.addressLine1 !== 'string') return;

        setHomeDestination({
          name: typeof parsed.name === 'string' ? parsed.name : 'Home',
          addressLine1: parsed.addressLine1,
          addressLine2: typeof parsed.addressLine2 === 'string' ? parsed.addressLine2 : undefined,
          latitude: typeof parsed.latitude === 'number' ? parsed.latitude : undefined,
          longitude: typeof parsed.longitude === 'number' ? parsed.longitude : undefined,
        });
      } catch {
        // Ignore corrupted saved home data and continue with defaults.
      }
    };

    void loadSavedHome();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isInFrileyZone || frileyEnteredAtRef.current === null) {
      setFrileyElapsedSeconds(0);
      return;
    }

    const updateElapsed = () => {
      if (frileyEnteredAtRef.current === null) {
        setFrileyElapsedSeconds(0);
        return;
      }

      const elapsed = Math.floor((Date.now() - frileyEnteredAtRef.current) / 1000);
      setFrileyElapsedSeconds(elapsed);
    };

    updateElapsed();
    const intervalId = setInterval(updateElapsed, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isInFrileyZone]);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let isMounted = true;

    const handleLocation = async (nextLocation: Location.LocationObject) => {
      if (!isMounted) return;

      latestLocationRef.current = nextLocation;
      setLocation(nextLocation);
      setErrorMsg(null);

      const now = Date.now();
      let nextStateName = latestStateNameRef.current;

      if (now - lastGeocodeTimeRef.current > GEOCODE_INTERVAL_MS) {
        lastGeocodeTimeRef.current = now;
        try {
          const addresses = await Location.reverseGeocodeAsync(nextLocation.coords);
          nextStateName = addresses[0]?.region ?? null;
          latestStateNameRef.current = nextStateName;
          if (isMounted) {
            setStateName(nextStateName);
          }
        } catch {
          // ignore reverse geocode errors
        }
      }

      const currentPlace = await fetchNearbyPlace(
        nextLocation.coords.latitude,
        nextLocation.coords.longitude
      );

      if (!isMounted) return;

      const nextDistanceToFriley = getDistanceMeters(
        nextLocation.coords.latitude,
        nextLocation.coords.longitude,
        FRILEY.latitude,
        FRILEY.longitude
      );

      setDistanceToFriley(nextDistanceToFriley);

      const placeName = currentPlace?.name.toLowerCase() ?? '';
      const isFriley = nextDistanceToFriley <= FRILEY.radius || placeName.includes('friley');
      const isRiskyVenue = !isFriley && isRiskyPlace(currentPlace?.primaryType, currentPlace?.name);
      const nextIsRiskZone = isFriley || isRiskyVenue;

      setIsInFrileyZone(isFriley);
      if (isFriley) {
        if (frileyEnteredAtRef.current === null) {
          frileyEnteredAtRef.current = Date.now();
        }
      } else {
        frileyEnteredAtRef.current = null;
      }

      setIsInRiskZone(nextIsRiskZone);

      if (nextIsRiskZone && !hasShownQuickCheckRef.current) {
        hasShownQuickCheckRef.current = true;
        openQuickCheckDialog(
          nextStateName,
          () => void openUberToAddressRef.current(nextLocation),
          () => void goToNearestHospitalRef.current(),
          () => void callEmergencyContactRef.current()
        );
      }

      if (!nextIsRiskZone) {
        hasShownQuickCheckRef.current = false;
      }
    };

    const startTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== 'granted') {
          setErrorMsg('Location permission denied.');
          return;
        }

        const currentLocation = await Location.getCurrentPositionAsync({});
        await handleLocation(currentLocation);

        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 25 },
          handleLocation
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        setErrorMsg(message);
      }
    };

    void startTracking();

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Polarys</Text>

      <Pressable style={styles.button} onPress={() => showQuickCheck()}>
        <Text style={styles.buttonText}>Test Quick Check</Text>
      </Pressable>

      <TextInput
        style={styles.input}
        value={homeQuery}
        onChangeText={setHomeQuery}
        placeholder="Type home address"
        placeholderTextColor="#9CA3AF"
        autoCapitalize="words"
        onFocus={() => setShowPredictions(true)}
        onSubmitEditing={() => {
          if (homePredictions.length > 0) {
            void selectHomePrediction(homePredictions[0]);
            return;
          }
          void setHomeByTypedAddress();
        }}
        returnKeyType="done"
      />

      {showPredictions && homePredictions.length > 0 ? (
        <View style={styles.predictionsBox}>
          {homePredictions.map((prediction) => (
            <Pressable
              key={prediction.placeId}
              style={styles.predictionItem}
              onPress={() => void selectHomePrediction(prediction)}>
              <Text style={styles.predictionMain}>{prediction.mainText}</Text>
              {prediction.secondaryText ? (
                <Text style={styles.predictionSecondary}>{prediction.secondaryText}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {isLoadingPredictions ? <Text style={styles.predictionHint}>Loading suggestions...</Text> : null}

      <Pressable style={styles.secondaryButton} onPress={() => void setHomeToCurrentLocation()}>
        <Text style={styles.secondaryButtonText}>Set Home Here</Text>
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={() => void setHomeByTypedAddress()}>
        <Text style={styles.secondaryButtonText}>
          {isSettingHome ? 'Setting Home...' : 'Set Home From Address'}
        </Text>
      </Pressable>

      <Text style={styles.homeText}>
        Home: {homeDestination.addressLine1}
        {homeDestination.addressLine2 ? `, ${homeDestination.addressLine2}` : ''}
      </Text>

      {location ? (
        <Text style={styles.location}>
          Location: {location.coords.latitude.toFixed(4)}, {location.coords.longitude.toFixed(4)}
        </Text>
      ) : null}

      {stateName ? <Text style={styles.state}>State: {stateName}</Text> : null}

      {matchedPlace ? (
        <>
          <Text style={styles.place}>Nearby place: {matchedPlace.name}</Text>
          <Text style={styles.placeType}>Type: {placeTypeLabel}</Text>
          {matchedPlace.formattedAddress ? (
            <Text style={styles.address}>Address: {matchedPlace.formattedAddress}</Text>
          ) : null}
        </>
      ) : null}

      {distanceToFriley !== null ? (
        <Text style={styles.distance}>Distance to Friley: {Math.round(distanceToFriley)}m</Text>
      ) : null}

      <Text style={styles.frileyTimer}>
        Time in Friley: {isInFrileyZone ? formatDuration(frileyElapsedSeconds) : '00:00:00'}
      </Text>

      <Text style={styles.zone}>{isInRiskZone ? 'Risk Zone Detected' : 'Safe Zone'}</Text>

      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F1A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  input: {
    marginTop: 12,
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#111827',
    borderColor: '#374151',
    borderWidth: 1,
    borderRadius: 10,
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  predictionsBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#111827',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 8,
    overflow: 'hidden',
  },
  predictionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomColor: '#1F2937',
    borderBottomWidth: 1,
  },
  predictionMain: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  predictionSecondary: {
    color: '#9CA3AF',
    marginTop: 2,
    fontSize: 12,
  },
  predictionHint: {
    color: '#93C5FD',
    marginTop: 6,
    textAlign: 'center',
    fontSize: 12,
  },
  secondaryButton: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  homeText: {
    color: '#93C5FD',
    marginTop: 10,
    textAlign: 'center',
  },
  location: {
    color: '#22C55E',
    marginTop: 20,
    textAlign: 'center',
  },
  state: {
    color: '#FACC15',
    marginTop: 10,
    textAlign: 'center',
  },
  place: {
    color: '#FFFFFF',
    marginTop: 10,
    textAlign: 'center',
  },
  placeType: {
    color: '#C084FC',
    marginTop: 4,
    textAlign: 'center',
  },
  address: {
    color: '#60A5FA',
    marginTop: 6,
    textAlign: 'center',
  },
  distance: {
    color: '#38BDF8',
    marginTop: 10,
    textAlign: 'center',
  },
  frileyTimer: {
    color: '#A3E635',
    marginTop: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  zone: {
    color: '#F472B6',
    marginTop: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  error: {
    color: '#F87171',
    marginTop: 20,
    textAlign: 'center',
  },
});
