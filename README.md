# Crocodile API Spike Test

Crocodile API is hosted at https://test-api.k6.io/ and includes various requests like Login, Create Croc, Fetch Croc and so on. Refer https://test-api.k6.io/ for the detailed reference.
  
The spike test includes two parts or scenarios:
1. **Standard Workload** covering the typical load expected
2. **Spike** in Get Public Crocodiles API request running in parallel to Scenario 1 traffic

**Standard Workload includes the below flow:**
1. Login (once per user)
2. Create Private Croc
3. Fetch Private Crocs
4. Update Private Croc
5. Delete Private Croc
   
20 Virtual Users will run through these flows in sequnce with a 1s wait time between the steps

The spike in load is only for the Get Public Crocodiles API, which is understood to occasionally spike up to 30 requests/sec

**Test data:**
User logins required for the Standard Workload have been pre-created in advance and loaded into data/test-users.csv file. Since these users will get periodically removed, it might be better to create the users as part of setup() function, though this will increase the overall test duration.
