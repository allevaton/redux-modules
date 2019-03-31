import produce from 'immer';
import { checkPropTypes, number, string } from 'prop-types';
import reduceReducers from 'reduce-reducers';
import * as Redux from 'redux';
import * as ReduxActions from 'redux-actions';
import v from 'voca';

const toConst = actionType =>
  v(actionType)
    .snakeCase()
    .upperCase()
    .value();

/**
 * @type BaseStore
 */
class Store {
  _modules = {};
  _reduxStore = null;
  _reducer = null;
  _state = undefined;

  constructor({ modules, initialState }) {
    this._modules = modules;

    this._reduxStore = Redux.createStore(() => undefined);

    for (const moduleName of Object.keys(modules)) {
      modules[moduleName]._store = this._reduxStore;
    }

    this._reducer = this._composeReducers(modules);

    this._reduxStore.replaceReducer(this._reducer);
    this._reduxStore.dispatch({ type: '@@INIT' });
  }

  _composeReducers(modules) {
    const reducers = [];
    for (const [moduleName, moduleValue] of Object.entries(modules)) {
      reducers.push((state = moduleValue._state, action) => {
        const moduleState =
          state[moduleName] === undefined
            ? moduleValue._state
            : state[moduleName];
        return {
          [moduleName]: moduleValue._reducer(moduleState, action),
        };
      });
    }
    return reduceReducers(...reducers);
  }
}

class Module {
  name;
  _reduxStore;
  _baseActions = null;
  _modules = {};
  _state = null;
  _actions = {};
  _selectors = {};
  _baseReducers = null;
  _reducers = null;

  _reducer = null;

  constructor({ name, actions, modules, reducers, state }) {
    this.name = name;
    this._modules = modules;
    this._state = state;
    this._baseActions = actions;
    this._baseReducers = reducers;
  }

  get _store() {
    return this._reduxStore;
  }

  set _store(newStore) {
    this._reduxStore = newStore;
    if (this._modules) {
      for (const moduleName of Object.keys(this._modules)) {
        this._modules[moduleName]._store = this._reduxStore;
      }
    }
    this._actions = this._transformActions(this._baseActions, this._modules);
    this._transformReducers(this._baseReducers, this._modules);
  }

  _transformActions(actions) {
    const newActions = {
      ...this._actions,
    };

    if (!actions) {
      return newActions;
    }

    for (const [name, descriptor] of Object.entries(actions)) {
      // TODO: get fully qualified path
      const descriptorValues = Object.entries(descriptor);
      newActions[name] = ReduxActions.createAction(toConst(name), (...args) => {
        const payload = {};

        for (let i = 0; i < args.length; i++) {
          const arg = args[i];
          const correspondingDescriptor = descriptorValues[i];

          payload[correspondingDescriptor[0]] = arg;
        }

        checkPropTypes(
          descriptor,
          payload,
          'action argument',
          `${this.name}.${name}`,
        );

        return payload;
      });
    }

    // return Redux.bindActionCreators(newActions, this._store.dispatch);
    return newActions;
  }

  _transformReducers(reducers, modules) {
    // TODO: more context built out
    const preTransformReducers = reducers({ actions: this._actions });
    this._reducers = preTransformReducers;

    this._reducer = produce((state, action) => {
      if (modules) {
        Object.entries(modules).forEach(([name, mod]) => {
          const moduleState =
            state[name] === undefined ? mod._state : state[name];

          state[name] = mod._reducer(moduleState, action);
        });
      }

      const caseReducer = preTransformReducers[action.type];
      if (caseReducer) {
        caseReducer(state, action);
      }
    });
  }
}

const responsibilityModule = new Module({
  name: 'Responsibilities',
  state: {
    count: 0,
    strings: [],
  },
  reducers({ actions }) {
    return {
      CREATED_PERSON(state, action) {
        state.strings.push(action.payload.responsibility);
        state.count++;
      },
    };
  },
});

const typesModule = new Module({
  state: [],
  reducers() {
    return {
      CREATED_PERSON(state, action) {
        state.push('Human');
      },
    };
  },
});

const peopleModule = new Module({
  name: 'People',
  state: {
    entities: {},
    byId: [],
  },
  modules: {
    types: typesModule,
    responsibility: responsibilityModule,
  },
  actions: {
    createdPerson: {
      id: number.isRequired,
      name: string.isRequired,
      age: number.isRequired,
      responsibility: string.isRequired,
    },
  },
  reducers({ actions }) {
    return {
      [actions.createdPerson](state, action) {
        const { id, name, age } = action.payload;

        state.entities[id] = {
          id,
          name,
          age,
        };
        state.byId.push(id);
      },
    };
  },
});

const store = new Store({
  modules: {
    people: peopleModule,
  },
});

const action = store._modules.people._actions.createdPerson(
  1,
  'Nick',
  25,
  'Programmer',
);
// console.log(action);
// console.log(
//   store._modules.people._reducer(store._modules.people._state, action),
// );

store._reduxStore.dispatch(action);

console.log(JSON.stringify(store._reduxStore.getState(), null, 2));
