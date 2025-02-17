import http from 'k6/http';
import { sleep, check, group } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';
import { randomString } from '../lib/helpers.js';

/**
 * A spike test that tests the Crocodile API at https://test-api.k6.io/
 * 
 * The test includes two parts or scenarios:
 * 1. Standard workload covering the typical load scenario
 * 2. Spike in Get Public Crocodiles API request running during steady state of Scenario 1 
 * 
 */

export const options = {
  cloud: {
    projectID: 3747835,
    name: 'CrocodilesAPI_Spike',
    distribution: {
      'amazon:us:ashburn': { loadZone: 'amazon:us:ashburn', percent: 100 }, //Use Ashburn load injectors as near Crocodiles API servers 
    },
  },

  thresholds: {
    http_req_failed: ['rate<0.01'], // http errors should be less than 1%
  },

  scenarios: {
    //Scenario 1: Standard workload mix i.e. typical load level
    standardWorkloadMix: {
      executor: 'ramping-vus',
      exec: 'standardWorkloadMix',

      startVUs: 0,
      stages: [
        { duration: '5m', target: 20 },
        { duration: '20m', target: 20 },
        { duration: '5m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },

    //Scenario 2: Spike to overlap with the standard workload mix
    //Spike of 30 tps after 10min into test, held for 1min and stopped 
    spikeWorkload: {
      executor: 'constant-arrival-rate',
      exec: 'spikeWorkload',
      startTime: '10m', //Start time of the spike
      duration: '1m', //Duration of the spike
      rate: 30,  //30 tps
      timeUnit: '1s',     
      preAllocatedVUs: 30,
      maxVUs: 30,       
    },
  },
};

// Test data for the test (shared across VUs)
// 1. Logins used by Standard Workload Mix
const sharedData = new SharedArray("Shared Logins", function () {
  let data = papaparse.parse(open('../data/test-users.csv'), { header: true }).data;
  return data;
});

const BASE_URL = 'https://test-api.k6.io';

export function standardWorkloadMix() {

  let authToken;
  let requestConfigWithTag;
  const STD_WORKLOAD_WAIT_TIME = 1;

  group('00. Login', () => {

    //Login only once per VU. Might need further changes to handle token expiry + refresh
    if (authToken == undefined) {

      const loginRes = http.post(`${BASE_URL}/auth/token/login/`, {
        username: sharedData[exec.vu.idInTest - 1].username,
        password: sharedData[exec.vu.idInTest - 1].password,
        },
        { tags : {name:'Login'}
     });

      if (check(loginRes, { 'Logged in successfully': (res) => res.status === 200 })) {
        authToken = loginRes.json('access');
      } else {
        console.log(`Unable to Login ${loginRes.status} ${loginRes.body}`);
        return;
      }
 
    }

    //Add authToken, tag to requests. Potentially move to helpers.js
    requestConfigWithTag = (tag) => ({
    headers: { Authorization: `Bearer ${authToken}`, },
    tags: Object.assign(
      {},
      { name: 'PrivateCrocs', },
      tag
    ),
    });

  });

  const PRIVATE_API_URL = `${BASE_URL}/my/crocodiles/`;
  let crocId;

  group('01. Create a new crocodile', () => {
    const payload = {
      name: `Name ${randomString(10)}`,
      sex: 'M',
      date_of_birth: '2022-01-01',
    };

    const res = http.post(PRIVATE_API_URL, payload, requestConfigWithTag({ name: 'Create Private Croc' }));

    if (check(res, { 'Croc created correctly': (r) => r.status === 201 })) {
      crocId = res.json('id');
    } else {
      console.log(`Unable to create a Croc ${res.status} ${res.body}`);
      return;
    }
  });

  sleep(STD_WORKLOAD_WAIT_TIME); //Wait time between requests

  group('02. Fetch private crocs', () => {
    const res = http.get(PRIVATE_API_URL, requestConfigWithTag({ name: 'Fetch Private Crocs' }));
    check(res, { 'retrieved crocs status': (r) => r.status === 200 });
    check(res.json(), { 'retrieved crocs list': (r) => r.length > 0 });
  });

  sleep(STD_WORKLOAD_WAIT_TIME); //Wait time between requests

  group('03. Update the croc', () => {
    const payload = { name: 'New name' };
    const res = http.patch(`${PRIVATE_API_URL}${crocId}/`, payload, requestConfigWithTag({ name: 'Update Private Croc' }));
    const isSuccessfulUpdate = check(res, {
      'Update worked': () => res.status === 200,
      'Updated name is correct': () => res.json('name') === 'New name',
    });

    if (!isSuccessfulUpdate) {
      console.log(`Unable to update the croc ${res.status} ${res.body}`);
      return;
    }
  });

  sleep(STD_WORKLOAD_WAIT_TIME); //Wait time between requests

  group('04. Delete the croc', () => {
    const delRes = http.del(`${PRIVATE_API_URL}${crocId}/`, null, requestConfigWithTag({ name: 'Delete Private Croc' }));

    const isSuccessfulDelete = check(null, {
      'Croc was deleted correctly': () => delRes.status === 204,
    });

    if (!isSuccessfulDelete) {
      console.log(`Croc was not deleted properly`);
      return;
    }
  });

  sleep(STD_WORKLOAD_WAIT_TIME); //Wait time between requests

}

export function spikeWorkload() {

  //Get a list of all public crocodiles - We occasionally get huge spikes of this transaction, upto 30 tps over 1 min
  const res = http.get(`${BASE_URL}/public/crocodiles/`, 
    { tags: { my_custom_tag: 'spikeWorkload',
              name: "Fetch Public Crocs",
            }
    }
  );
  check(res, { 'retrieved crocs status': (r) => r.status === 200 });
  check(res.json(), { 'retrieved crocs list': (r) => r.length > 0 });

}
