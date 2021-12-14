import {
  RouteResource,
  ResourceDependencies,
  RouterContext,
  ResourceType,
} from '../../../../common/types';
import { StoreActionApi } from 'react-sweet-state';
import { State, ResourceAction } from '../../types';
import { getSliceForResource } from '../../selectors';

const SymbolExtended = Symbol('extendedApi');

type SyncOrAsyncChange = Promise<ResourceType | null> & {
  result?: ResourceType | null;
};

type ExtendedApi = StoreActionApi<State> & {
  [SymbolExtended]: true;
  getDependencies: (
    resource: RouteResource<unknown>
  ) => ResourceDependencies | null;
  beginChange: (type: string) => (didChange: boolean) => void;
};

type DependentResourceTuple = [
  RouteResource & { depends: ResourceType[] },
  number
];

const getDependenciesNoop = () => null;
const beginChangeNoop = () => () => undefined;

export const withDependentResources = <T extends unknown>(
  routerStoreContext: RouterContext,
  refreshAction: (resources: RouteResource[]) => ResourceAction<any>,
  wrappedAction: (api: ExtendedApi) => T
): ResourceAction<T> => (api: StoreActionApi<State> | ExtendedApi): T => {
  // extended api is created only at the outer most call and reused during recursion
  if (SymbolExtended in api) {
    return wrappedAction(api as ExtendedApi);
  }

  const {
    route: { resources: routeResources = [] },
  } = routerStoreContext;
  const dependentResourceTuples = routeResources
    .map((resource, i) => (resource.depends?.length ? [resource, i] : null))
    .filter((v): v is DependentResourceTuple => !!v);

  // stub extended API when there are no dependencies on the current route resources
  if (dependentResourceTuples.length === 0) {
    return wrappedAction({
      ...api,
      [SymbolExtended]: true,
      getDependencies: getDependenciesNoop,
      beginChange: beginChangeNoop,
    });
  }

  const getDependencies = (
    resource: RouteResource
  ): ResourceDependencies | null => {
    if (!resource.depends?.length) {
      return null;
    }

    const { context: resourceStoreContext, ...state } = api.getState();
    const indexForResource = routeResources.findIndex(
      ({ type }) => type === resource.type
    );

    return Object.fromEntries(
      routeResources
        .slice(0, indexForResource + 1)
        .filter(({ type }) => resource.depends!.includes(type))
        .map(({ type, getKey }) => {
          const key = getKey(routerStoreContext, resourceStoreContext);
          const slice = getSliceForResource(state, { type, key });

          return [type, slice];
        })
    );
  };

  const accumulatedChanges: SyncOrAsyncChange[] = [];

  const beginChange = (type: ResourceType) => {
    let callback: (didChange: boolean) => void = () => undefined;

    // note there is no promise.result until the promise resolves
    const promise: SyncOrAsyncChange = new Promise<ResourceType | null>(
      resolve => {
        callback = (didChange: boolean) => {
          const result = didChange ? type : null;
          promise.result = result;
          resolve(result);
        };
      }
    );
    accumulatedChanges.push(promise);

    return callback;
  };

  const processChanges = (changes: (ResourceType | null)[]) => {
    const resourcesToRefresh = dependentResourceTuples
      .filter(([{ type }]) => !changes.includes(type)) // recent change should be sufficient
      .filter(([{ depends }, index]) =>
        routeResources
          .slice(0, index) // to avoid circular dependencies we must limit to preceding resources only
          .some(({ type }) => changes.includes(type) && depends.includes(type))
      )
      .map(([resource]) => resource);

    // use original api to process all updates together but separately to this instance
    if (resourcesToRefresh.length) {
      api.dispatch(refreshAction(resourcesToRefresh));
    }
  };

  // ensure any nested dispatch uses the same extended API defined here
  const extendedApi: ExtendedApi = {
    ...api,
    [SymbolExtended]: true,
    dispatch: thunk => thunk(extendedApi, undefined),
    getDependencies,
    beginChange,
  };
  const returnValue = wrappedAction(extendedApi);

  // we must wait for async to complete to know if a change occurred
  // however where changes are synchronous we should ensure any dependent refresh is also synchronous
  if (accumulatedChanges.length) {
    if (accumulatedChanges.every(syncOrAsync => 'result' in syncOrAsync)) {
      processChanges(accumulatedChanges.map(({ result }) => result ?? null));
    } else {
      Promise.all(accumulatedChanges).then(processChanges);
    }
  }

  return returnValue;
};
