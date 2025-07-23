To determine the proportion (percentage) of the Win and Place pools for a specific runner, you need to query the **Events-For-A-Specified-Race** endpoint and parse the response. This will require making a request that specifically includes tote trends data.

Here is a step-by-step guide on how to extract and calculate this information:

### 1. Target Endpoint and Parameters

You will need to make a GET request to the ` /affiliates/v1/racing/events/{id}` endpoint.

- **`{id}`**: This is the unique `event_id` for the specific race you are interested in. You can obtain this ID from the `List-Of-Races` or `List-of-meetings` endpoints.
- **`with_tote_trends_data=true`**: This is a crucial query parameter. You must include it in your request to receive the detailed investment data required for the calculation.

**Example Request URL:**
`{{baseUrl}}/affiliates/v1/racing/events/0f57e087-00d9-4c61-9549-835abe2ae2ed?with_tote_trends_data=true`

### 2. Locating the Data in the Response

The response from this endpoint will be a JSON object. The key data points are located in two different sections within the `data.tote_pools` array:

- **Total Pool Size**: The total dollar amount for the Win and Place pools.
- **Runner's Investment**: The specific dollar amount invested on each runner within those pools. This is contained within a raw XML string.

### 3. Calculation Steps

**Step 1: Isolate the Win and Place Pools**
Navigate to `data.tote_pools` in the JSON response. This is an array containing objects for each pool type. You will need to identify the objects where the `product_type` is "Win" and "Place".

- From the object with `"product_type": "Win"`, get the value of the `total` key. This is your **Total Win Pool**.
- From the object with `"product_type": "Place"`, get the value of the `total` key. This is your **Total Place Pool**.

**Step 2: Extract Runner-Specific Investment from XML**
Within both the "Win" and "Place" pool objects, navigate to `tote_trends.tote_trends_data`. This key holds a raw XML string that needs to be parsed.

Inside the XML, you will find a `<runners>` element containing multiple `<runner>` elements, one for each entrant in the race. Find the `<runner>` corresponding to your horse of interest (identified by its `runner_number`).

The investment amount for that runner is located in the `<runner_investment1>` tag.

**Step 3: Calculate the Percentages**
Once you have extracted the total pool sizes and the specific investment for your runner, you can calculate the proportions using the following formulas:

- **Runner's Win Pool %** = (`<runner_investment1>` from Win Pool XML / **Total Win Pool**) \* 100
- **Runner's Place Pool %** = (`<runner_investment1>` from Place Pool XML / **Total Place Pool**) \* 100

### Tracking Changes Over Time

To monitor how a runner's percentage of the pools changes, you must periodically send a new request to the ` /affiliates/v1/racing/events/{id}?with_tote_trends_data=true` endpoint for the same race ID in the time leading up to the race. Each new request will provide the updated pool totals and investment figures.
