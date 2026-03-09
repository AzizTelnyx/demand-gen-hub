# Campaign Naming Conventions

## Google Ads Campaign Name
**Format:** `YEARMM FunnelStage ProductName Content Region`
**Example:** `202602 BOFU AI Agent LiveKit SA GLOBAL`
**Rules:**
- NO underscores in campaign name (use spaces)
- All caps for funnel stage and region
- Funnel stages: TOFU, MOFU, BOFU
- Regions: AMER, EMEA, APAC, MENA, GLOBAL

## UTM Campaign Parameter
**Format:** `YEARMM_FunnelStage_ProductName_Content_Region`
**Example:** `202602_BOFU_AI_Agent_LiveKit_SA_GLOBAL`
**Note:** Underscores OK in utm_campaign (different from campaign name)

## Content Type Codes
| Channel | Code |
|---------|------|
| Search Ad | SA |
| Display Ad | DA |
| Video Ad | VA |
| Single Image | SI |
| Carousel | CA |

## Full UTM Example
```
?utm_source=google&utm_medium=paid_search&utm_campaign=202602_BOFU_AI_Agent_LiveKit_SA_GLOBAL&utm_content={adgroupid}&utm_term={keyword}
```

## UTM Source/Medium by Platform
| Platform | utm_source | utm_medium |
|----------|-----------|------------|
| Google Search | google | paid_search |
| Google Display | google | display |
| LinkedIn | linkedin | paid_social |
| StackAdapt | stackadapt | programmatic |
| Reddit | reddit | paid_social |
