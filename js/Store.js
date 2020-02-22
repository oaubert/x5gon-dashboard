import constant from './Constants.js';

/**
 * Randomly shuffle an array (in place)
 * https://stackoverflow.com/a/2450976/1293256
 * @param  {Array} array The array to shuffle
 * @return {String}      The first item in the shuffled array
 */
let shuffle = function (array) {

    var currentIndex = array.length;
    var temporaryValue, randomIndex;

    // While there remain elements to shuffle...
      while (0 !== currentIndex) {
          // Pick a remaining element...
          randomIndex = Math.floor(Math.random() * currentIndex);
          currentIndex -= 1;

          // And swap it with the current element.
          temporaryValue = array[currentIndex];
          array[currentIndex] = array[randomIndex];
          array[randomIndex] = temporaryValue;
      }

    return array;

};

// Store for application global state
const store = new Vuex.Store({

    state: {
        // Cache for objects, indexed by object id, with resource data as values
        resources: {},
        // Current search results
        search_results: [],
        query: "",
        overview_reference: null,
        overview_neighbors: [],
        // We only have 1 basket
        basket: [],
        // Assume we only deal with 1 sequence in the app
        sequence: [],
        // Insert suggestions
        insertions: [],
        // List of notification messages
        notification_messages: [],
        // Loading message. If not null, display loading spinner
        loading_message: "",
    },

    // Mutation are synchronous. They should normally not be directly called, but instead through actions (see below)
    mutations: {
        update_search_results(state, results) {
            state.search_results = results;
            results.forEach(r => state.resources[r.id] = r);
        },
        set_query(state, query) {
            state.query = query;
        },
        add_notification(state, message) {
            let timestamp = new Date();
            console.log(timestamp, message);
            state.notification_messages.push( {
                message: message,
                type: message.type || "info",
                date: timestamp
            } );
        },
        remove_notification(state, message) {
            var i = state.notification_messages.map(n => n.message).indexOf(message);
            if (i == -1) {
                return;
            }
            state.notification_messages.splice(i, 1);
        },
        set_overview_reference(state, resource) {
            state.overview_reference = resource;
            state.resources[resource.id] = resource;
        },
        set_overview_neighbors(state, neighbors) {
            state.overview_neighbors = neighbors;
            neighbors.forEach(r => state.resources[r.id] = r);
        },

        set_loading_message(state, message = "Loading...") {
            state.loading_message = message;
        },

        add_to_basket(state, item) {
            if (state.basket.indexOf(item) == -1) {
                state.basket.push(item);
            }
        },
        populate_basket(state, count) {
            // Debug method - populate the basket with count items from overview_neighbors
            let items = shuffle(state.overview_neighbors.slice()).slice(0, count);
            items.forEach(item => this.commit('add_to_basket', item));
        },

        set_sequence(state, sequence) {
            state.sequence = sequence.map(id => state.resources[id]);
            state.insertions = [];
            console.log("sequence", state.sequence);
        },

        set_insertions(state, insertions) {
            insertions = insertions.map(i => (i === null ? null : { ...i.resource,
                                                                    insertion_confidence: i.confidence }));
            console.log("insertions", insertions);
            state.insertions = insertions;
            insertions
                .filter(i => i !== null)
                .forEach(r => {
                    state.resources[r.id] = r
                    // Limit number of concepts
                    r.wikifier = r.wikifier.slice(0, constant.max_concepts);
                });
        },

        validate_insertion(state, index) {
            // Insert an item *after* the given index
            // Validate an insertion: put into sequence, replace by 2 nulls in insertions
            let item = state.insertions[index];

            state.sequence.splice(index + 1, 0, item);
            state.insertions.splice(index, 1, null, null);
            item.is_suggested = false;
            console.log("validat_insertion", state.sequence, state.insertions);
        },

    },

    // Actions are asynchronous. They are called with the dispatch method (or through mapActions in components)
    actions: {

        // Generic API query method. It returns a Promise that wraps
        // all errors/exceptions into a single reject clause, and
        // handle start_loading/stop_loading notifications
        // appropriately.
        async query_api({ commit }, query) {
            let { url, params, message } = query;
            let _store = this;
            this.dispatch("start_loading", message);
            return new Promise(function (resolve, reject) {
                try {
                    fetch(url, {
                        method: 'POST',
                        //mode: 'cors',
                        cache: 'no-cache',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                        },
                        body: JSON.stringify(params)
                    }).catch(error => {
                        _store.dispatch("stop_loading", "");
                        reject(error);
                        return;
                    }).then(response => {
                        if (response === undefined) {
                            _store.dispatch("stop_loading", "");
                            reject("Undefined result");
                            return;
                        }
                        response.json()
                            .catch(error => {
                                _store.dispatch("stop_loading", "");
                                reject(error);
                                return;
                            })
                            .then(data => {
                                _store.dispatch("stop_loading", "");
                                if (!data) {
                                    reject(error);
                                    return;
                                }
                                resolve(data);
                            })
                    })
                } catch (error) {
                    _store.dispatch("stop_loading", "");
                    reject(error);
                    return;
                }
            });
        },

        async submit_search_query({ commit }, query) {
            let url = constant.api.search;
            if (query && query.startsWith('d:')) {
                // Debug mode - use local resources
                url = `data/${query.substr(2)}.json`;
            }

            this.dispatch('query_api',
                          { url: url,
                            params: {
                                q: query,
                                max_resources: constant.max_search_results,
                                max_concepts: constant.max_concepts,
                            },
                            message: `Searching for ${query}`
                          }).then(data => {
                             if (!data) {
                                 this.dispatch("show_error_notification", `No data for ${query}`);
                                 return;
                             }
                             console.log("query result", data, data.result);
                             let result = data.result;
                             commit('set_query', query);
                             commit('update_search_results', result);
                         }).catch(error => {
                             this.dispatch("show_error_notification", `Error when searching: ${error}`);
                         });
        },

        async activate_overview_reference({ commit }, resource_id) {
            // Query neighbors
            resource_id = Number(resource_id);
            let url = resource_id == 23345 || resource_id == 23344 ? `data/n${resource_id}.json` : constant.api.neighbors;

            this.dispatch('query_api',
                          { url: url,
                            params: { id: resource_id,
                                      max_concepts: constant.max_concepts,
                                      max_resources: constant.max_neighbors
                                    },
                            message: "Fetching neighbors..."
                          }).then(data => {
                              commit("set_overview_reference", data.reference);
                              commit('set_overview_neighbors', data.neighbors);
                          }).catch(error => {
                              this.dispatch("show_error_notification", `Error when fetching neighbors: ${error}`);
                          });
        },

        async sort_basket({ commit }) {
            // The sort API does not want to get empty sequences
            if (this.state.basket.length == 0) {
                commit('set_sequence', []);
                return;
            }
            this.dispatch('query_api',
                          { url: constant.api.sequence_sort,
                            params: {
                                basket: this.state.basket.map(item => item.id)
                            },
                            message: "Sorting basket..."
                          }).then(data => {
                              commit('set_sequence', data.output.sequence);
                          }).catch(error => {
                              this.dispatch("show_error_notification", `Error when sorting basket: ${error}`);
                          });
        },

        async suggest_insertions({ commit }) {
            if (this.state.sequence.length == 0) {
                return;
            }
            this.dispatch('query_api',
                          { url: constant.api.sequence_insert,
                            params: {
                                sequence: this.state.sequence.map(item => item.id),
                                concept_weights: this.state.sequence[0].wikifier.map(w => ({
                                    concept: w.url,
                                    weight: w.value,
                                }))
                            },
                            message: "Fetching resource suggestions..."
                          }).then(data => {
                              commit('set_sequence', data.output.sequence);
                              commit('set_insertions', data.output.insertions);
                          }).catch(error => {
                              this.dispatch("show_error_notification", `Error when getting insert suggestions: ${error}`);
                          });
        },

        async show_error_notification({ commit }, message) {
            message.type = 'error';
            return this.dispatch('show_notification', message);
        },

        async show_notification({ commit }, message) {
            commit("add_notification", message, type);
            var timeOut = setTimeout(function () {
                // On timeout mutate state to dismiss notification
                commit("remove_notification", message);
            }, duration);
        },

        async add_to_basket({ commit }, item) {
            commit("add_to_basket", item);
        },

        async populate_basket({ commit }, count) {
            commit("populate_basket", count);
        },

        async start_loading({ commit }, message = "Loading...") {
            commit("set_loading_message", message);
        },

        async stop_loading({ commit }) {
            commit("set_loading_message", "");
        },

        async validate_insertion({ commit }, index) {
            let item = this.state.insertions[index];
            commit("validate_insertion", index);
            commit("add_to_basket", item);
        }
    }
});

export default store;
