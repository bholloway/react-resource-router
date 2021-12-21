import { Action } from 'react-sweet-state';
import {
  RouteResource,
  ResourceDependencies,
  RouterContext,
} from '../../../../common/types';
import {
  ExecutionTuple,
  ExecutionMaybeTuple,
  ResourceAction,
  State,
} from '../../types';
import { getSliceForResource } from '../../selectors';

export const executeTuples = <R>(
  routeResources: RouteResource[] | null | undefined,
  tuples: ExecutionTuple[]
): ResourceAction<R[]> => ({ getState, setState, dispatch }) => {
  if (getState().executing) {
    throw new Error('execution is already in progress');
  }

  // unique list of resource types that trigger dependent resources
  const triggers =
    routeResources
      ?.flatMap(({ depends }) => depends ?? [])
      .filter((v, i, a) => a.indexOf(v) === i) ?? [];

  // check if the actions we are explicitly executing will actually trigger a dependent resource
  // its common to execute an action that will not trigger anything so lets optimise for that
  const willExecuteAnyTrigger =
    triggers.length > 0 && tuples.some(([{ type }]) => triggers.includes(type));
  const resources = willExecuteAnyTrigger ? routeResources ?? null : null;

  // simply dispatch actions for independent or unlisted resources
  if (!resources) {
    return tuples.map(([, action]): R => dispatch(action));
  }

  // setup execution list before dispatching actions
  // we need only include dependent resources, since other resources can be executed in any order
  // limiting to dependent resources helps when debugging large resource lists with sparse dependencies
  // we can be confident this array is non empty since we previously determined there will be a trigger
  const executing = resources.reduce((acc, resource) => {
    const tuple = tuples.find(([{ type }]) => type === resource.type);

    return resource.depends?.length || triggers.includes(resource.type)
      ? [...acc, tuple ?? [resource, null]]
      : acc;
  }, [] as ExecutionMaybeTuple[]);

  setState({ executing });

  // dispatch sequentially during which dependencies can cause some tuples to change action
  const executionResultByType = Object.fromEntries(
    executing.map(([{ type }], i) => {
      const { executing: currentExecuting } = getState();
      const [resource, maybeAction] = currentExecuting?.[i] ?? [];

      if (resource?.type !== type) {
        throw new Error('execution reached an inconsistent state');
      }

      return [type, maybeAction ? dispatch(maybeAction) : undefined];
    })
  );

  setState({ executing: null });

  // pick existing results for executed resources
  // dispatch remaining actions for independent or unlisted resources
  return tuples.map(
    ([{ type }, action]): R =>
      type in executionResultByType
        ? executionResultByType[type]
        : dispatch(action)
  );
};

export const actionWithDependencies = <R extends unknown>(
  routeResources: RouteResource[] | undefined,
  resource: RouteResource,
  action: ResourceAction<R>
): ResourceAction<R> => ({ dispatch }) =>
  dispatch(
    executeTuples<R>(routeResources, [[resource, action]])
  )[0];

export const mapActionWithDependencies = <R extends unknown>(
  routeResources: RouteResource[] | undefined,
  resources: RouteResource[],
  actionCreator: (resource: RouteResource) => ResourceAction<R>
): ResourceAction<R[]> =>
  executeTuples<R>(
    routeResources,
    resources.map(resource => [resource, actionCreator(resource)])
  );

export const executeForDependents = <T extends any[]>(
  { type }: RouteResource,
  action: (resource: RouteResource, ...args: T) => Action<State, void, any>,
  ...args: T
): ResourceAction<void> => ({ getState, setState }) => {
  const { executing: currentExecuting } = getState();
  const indexForResource =
    currentExecuting?.findIndex(([el]) => el.type === type) ?? -1;
  if (indexForResource < 0) {
    return;
  }

  const executing = currentExecuting!.map(
    (tuple, i): ExecutionMaybeTuple => {
      const [resource] = tuple;

      return i > indexForResource && resource.depends?.includes(type)
        ? [resource, action(resource, ...args)]
        : tuple;
    }
  );

  setState({ executing });
};

export const getDependencies = (
  { depends }: RouteResource,
  routerStoreContext: RouterContext
): ResourceAction<ResourceDependencies | null> => ({ getState }) => {
  const { executing, data, context: resourceStoreContext } = getState();

  return executing && depends?.length
    ? Object.fromEntries(
        executing
          .filter(([{ type }]) => depends!.includes(type))
          .map(([{ type, getKey }]) => {
            const key = getKey(routerStoreContext, resourceStoreContext);
            const slice = getSliceForResource({ data }, { type, key });

            return [type, slice];
          })
      )
    : null;
};
