/* eslint-disable no-use-before-define */

import { Action, StoreActionApi } from 'react-sweet-state';

import {
  ResourceStoreContext,
  ResourceStoreData,
  RouteResource,
  RouteResourceResponse,
  RouteResourceUpdater,
  RouterContext,
} from '../../common/types';

export type State = {
  data: ResourceStoreData;
  context: ResourceStoreContext;
};

export type HydratableState = {
  resourceData?: ResourceStoreData;
  resourceContext?: ResourceStoreContext;
};

export type ContainerProps = {};

export type ResourceSliceIdentifier = {
  type: string;
  key: string;
};

type GetResourceOptions = {
  prefetch?: boolean;
  timeout?: number;
};

export type ResourceAction<T> = Action<State, void, T>;

export type Actions = {
  updateResourceState: (
    resource: RouteResource,
    routerStoreContext: RouterContext,
    getNewSliceData: RouteResourceUpdater
  ) => ResourceAction<void>;
  getResource: (
    resource: RouteResource,
    routerStoreContext: RouterContext,
    options: GetResourceOptions
  ) => ResourceAction<Promise<RouteResourceResponse>>;
  getResourceFromRemote: (
    resource: RouteResource,
    routerStoreContext: RouterContext,
    options: GetResourceOptions
  ) => ResourceAction<Promise<RouteResourceResponse>>;
  requestAllResources: (
    routerStoreContext: RouterContext,
    options?: GetResourceOptions
  ) => ResourceAction<Promise<RouteResourceResponse[]>>;
  cleanExpiredResources: (
    resources: RouteResource[],
    routerStoreContext: RouterContext
  ) => ResourceAction<void>;
  requestResources: (
    resources: RouteResource[],
    routerStoreContext: RouterContext,
    options: GetResourceOptions
  ) => ResourceAction<Promise<RouteResourceResponse>[]>;
  refreshResources: (
    resources: RouteResource[],
    routerStoreContext: RouterContext,
    options: GetResourceOptions
  ) => ResourceAction<Promise<RouteResourceResponse>[]>;
  hydrate: (
    state: HydratableState
  ) => ({ getState, setState }: StoreActionApi<State>) => void;
  getContext: () => ({
    setState,
    getState,
  }: StoreActionApi<State>) => ResourceStoreContext;
  getSafeData: () => ({
    setState,
    getState,
  }: StoreActionApi<State>) => ResourceStoreData;
};
