// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/*
 * Registry Usage Helper Script
 * Generate ECR usage Athena queries needed for dashboard update
 * * Generate athena queries for private ecr pull count by version tag
 * * Generate athena queries for private ecr pull count by region
 * * Query public ecr for public ecr pull count
 * * Query dockerhub for dockerhub registry pull count
 */

const { writeFileSync } = require("fs"); 
const { execSync } = require('child_process');
const result = execSync('aws ecr describe-images --repository-name aws-for-fluent-bit --registry-id 906394416424 --output json');

const queryFromTag = "2.28.4";
const startDate = "2023-10-01T00:00:00Z";
const endDate = "2023-11-01T00:00:00Z";

const filePrefix = (new Date()).toISOString();

const description = JSON.parse(result.toString());

const tags = description.imageDetails.map(i => 
    (i?.imageTags ?? [])
        .filter(t => (t.charAt(0) >= '0' && t.charAt(0) <= '9'))
        .filter(t => (!t.includes("-")))).flat();

const sortedTags = tags.map(t => (
    {
        tag: t,
        semverSortable: `${t.split(".")[0].padStart(10, "0")}${t.split(".")[1].padStart(10, "0")}${t.split(".")[2].padStart(10, "0")}${(t.split(".")[0] ?? 0).padStart(10, "0")}`
    }
)).sort((a,b) => a.semverSortable.localeCompare(b.semverSortable))
.map(a => a.tag);

const fromTagId = sortedTags.findIndex(t => t==queryFromTag);
const queriedTags = sortedTags.slice(fromTagId);

const ignoreTags=["stable", "latest", "windowsservercore-stable", "windowsservercore-latest", "debug"]
ignoreHash=["debug"]
const athenaQueries = queriedTags.map(searchTag => {
    imgscpy = description.imageDetails.filter(i=>(i.imageTags ?? []).some(t=>(`${t}-`).includes(`${searchTag}-`)))
    imgsqueryTagsRaw = imgscpy.map(c => 
        c.imageTags.filter(i => !ignoreTags.some(find => i.includes(find)))).flat();
    imgsqueryTags = imgsqueryTagsRaw
        .map((t, idx) => `            ${(idx==0) ? "" : "OR "}requestparameters like '%"imageTag":"${t}"%'\n`);

    imgsQueryHashUnprocessed = imgscpy.filter(c => c.imageTags.every(i => !ignoreHash.some(find => i.includes(find))));
    imgsqueryHash = imgsQueryHashUnprocessed
        .map((c, i) => `            OR requestparameters like '%${c.imageDigest.split(":")[1]}%'${(i == imgsQueryHashUnprocessed.length - 1) ? "" : "\n"}`)
    return {
        tag: searchTag,
        query: [...imgsqueryTags, ...imgsqueryHash].flat().join(""),
    };
});

const fullQuery = 
`-- Combined Athena Query, Generated ${(new Date()).toLocaleString('default', {month: 'long'})} ${(new Date()).getFullYear()}, Run in classic account, us-west-2
-- Auto-generated by athena-all.js. See FireLens Datajet ops scripts for reference
-- Url: https://github.com/aws/firelens-datajet/tree/main/apps
SELECT ${
    athenaQueries.map((q, i) =>

`(
    SELECT COUNT(*) as call_count
    FROM cloudtrail_fluentbitimage
    WHERE eventsource = 'ecr.amazonaws.com'
        AND eventname in ('GetDownloadUrlForLayer', 'BatchGetImage')
        AND eventTime > '${startDate}'
        AND eventTime < '${endDate}'
        AND (
${q.query}
        )
) AS call_count_v${q.tag.replaceAll(".", "_")},
`).join("")

}(
    SELECT COUNT(*) as call_count
    FROM cloudtrail_fluentbitimage
    WHERE eventsource = 'ecr.amazonaws.com'
        AND eventname in ('GetDownloadUrlForLayer', 'BatchGetImage')
        AND eventTime > '${startDate}'
        AND eventTime < '${endDate}'
        AND (
            requestparameters like '%stable%'
        )
) AS call_count_stable,
(
    SELECT COUNT(*) as call_count
    FROM cloudtrail_fluentbitimage
    WHERE eventsource = 'ecr.amazonaws.com'
        AND eventname in ('GetDownloadUrlForLayer', 'BatchGetImage')
        AND eventTime > '${startDate}'
        AND eventTime < '${endDate}'
        AND (
            requestparameters like '%latest%'
        )
) AS call_count_latest`;


writeFileSync(`./${filePrefix}-AthenaQuery_0_VersionTags.txt`, fullQuery);


/* Regional ecrs */
const generationMessage = `Generated ${(new Date()).toLocaleString('default', {month: 'long'})} ${(new Date()).getFullYear()}`;
const classicRegionQuery = `-- Classic Image Pulls Athena Query, ${generationMessage}, Run in classic account, us-west-2
SELECT COUNT(*) as call_count
FROM cloudtrail_fluentbitimage
WHERE
    eventsource = 'ecr.amazonaws.com' AND
    eventname in ('GetDownloadUrlForLayer', 'BatchGetImage') AND
    eventTime > '${startDate}' AND
    eventTime < '${endDate}'`

writeFileSync(`./${filePrefix}-AthenaQuery_1_Classic_906394416424_us-west-2.txt`, classicRegionQuery);


const hkgRegionQuery = `-- HKG Image Pulls Athena Query, ${generationMessage}, Run in hkg account, ap-east-1
SELECT awsRegion, COUNT(*) as call_count
FROM "cloudtrail_fluentbit"
WHERE
    eventsource = 'ecr.amazonaws.com' AND
    eventname in ('GetDownloadUrlForLayer', 'BatchGetImage') AND
    eventTime > '${startDate}' AND
    eventTime < '${endDate}'
GROUP BY
    awsRegion`

writeFileSync(`./${filePrefix}-AthenaQuery_2_HKG_449074385750_ap-east-1.txt`, hkgRegionQuery);


const bahRegionQuery = `-- BAH Image Pulls Athena Query, ${generationMessage}, Run in bah account, me-south-1
SELECT awsRegion, COUNT(*) as call_count
FROM "cloudtrail_fluentbit"
WHERE
    eventsource = 'ecr.amazonaws.com' AND
    eventname in ('GetDownloadUrlForLayer', 'BatchGetImage') AND
    eventTime > '${startDate}' AND
    eventTime < '${endDate}'
GROUP BY
    awsRegion`

writeFileSync(`./${filePrefix}-AthenaQuery_3_BAH_741863432321_me-south-1.txt`, bahRegionQuery);


const mxpRegionQuery = `-- MXP Image Pulls Athena Query, ${generationMessage}, Run in mxp account, us-east-1
SELECT awsRegion, COUNT(*) as call_count
FROM "cloudtrail_fluentbitimage"
WHERE
    eventsource = 'ecr.amazonaws.com' AND
    eventname in ('GetDownloadUrlForLayer', 'BatchGetImage') AND
    eventTime > '${startDate}' AND
    eventTime < '${endDate}'
GROUP BY
    awsRegion`

writeFileSync(`./${filePrefix}-AthenaQuery_4_MXP_928143927712_us-east-1.txt`, mxpRegionQuery);


const cptRegionQuery = `-- CPT Image Pulls Athena Query, ${generationMessage}, Run in cpt account, us-east-1
SELECT awsRegion, COUNT(*) as call_count
FROM "cloudtrail_fluentbitimage"
WHERE
    eventsource = 'ecr.amazonaws.com' AND
    eventname in ('GetDownloadUrlForLayer', 'BatchGetImage') AND
    eventTime > '${startDate}' AND
    eventTime < '${endDate}'
GROUP BY
    awsRegion`

writeFileSync(`./${filePrefix}-AthenaQuery_5_CPT_928143927712_us-east-1.txt`, cptRegionQuery);


const govRegionQuery = `-- GOV Image Pulls Athena Query, ${generationMessage}, Run in gov account, us-gov-west-1
SELECT COUNT(*) as call_count
FROM cloudtrail_fluentbitimage
WHERE
    eventsource = 'ecr.amazonaws.com' AND
    eventname in ('GetDownloadUrlForLayer', 'BatchGetImage') AND
    eventTime > '${startDate}' AND
    eventTime < '${endDate}'`

writeFileSync(`./${filePrefix}-AthenaQuery_6_GOV_928143927712_us-gov-west-1.txt`, govRegionQuery);


const publicECRTokenRaw = execSync(`curl -s -S -k https://public.ecr.aws/token/`);
const publicECRToken = JSON.parse(publicECRTokenRaw).token;
const publicECRPullCountRaw = execSync(`curl -s -S -k -H "Authorization: Bearer ${publicECRToken}" \
'https://api.us-east-1.gallery.ecr.aws/getRepositoryCatalogData' \
 -H "Content-Type: application/json" --request POST \
 --data '{"registryAliasName":"aws-observability","repositoryName":"aws-for-fluent-bit"}'`);
const publicECRPullCount = JSON.parse(publicECRPullCountRaw).insightData.downloadCount;

const dockerRegistryPullCountRaw = execSync(`curl -s -S -k https://hub.docker.com/v2/repositories/amazon/aws-for-fluent-bit/`)
const dockerRegistryPullCount = JSON.parse(dockerRegistryPullCountRaw).pull_count;

const enhancedGenerationMessage = `Generated ${(new Date()).toLocaleString('default', {month: 'long'})} ${(new Date()).getDate()}, ${(new Date()).getFullYear()}`;

const pullCountFile =
`## Public ECR Pull Count, ${enhancedGenerationMessage}
  Public ECR aws-for-fluent-bit pull count: ${publicECRPullCount}
  DockerHub pull count: ${dockerRegistryPullCount}
`;

writeFileSync(`./${filePrefix}-PublicECRPullCount.txt`, pullCountFile);