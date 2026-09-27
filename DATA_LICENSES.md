# Data sources and licenses

Fuel uses only openly licensed or public-domain nutrition data, plus data the
user owns. Nothing here implies endorsement by any data provider.

| Source | Used for | License | Attribution |
|---|---|---|---|
| [Canadian Nutrient File](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/nutrient-data.html) (Health Canada) | Generic foods, macro and micronutrients, Canadian serving sizes | [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada) | "Contains information licensed under the Open Government Licence – Canada." |
| [Open Food Facts](https://world.openfoodfacts.org) | Packaged-food barcode lookups (Canadian products first) | Database: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); contents: [DbCL 1.0](https://opendatacommons.org/licenses/dbcl/1-0/) | "Food data © Open Food Facts contributors, available under the ODbL." Any redistributed subset (for example the Canadian data pack) is published under the ODbL. Product images (CC BY-SA) are not used. |
| [USDA FoodData Central](https://fdc.nal.usda.gov) | Fallback for products missing from Canadian sources (flagged as US data) | Public domain ([CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)) | "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central." |
| Health Canada [Table of Daily Values](https://www.canada.ca/en/health-canada/services/food-nutrition/nutrition-labelling/regulations-compliance.html) and [Dietary Reference Intakes](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes.html) | %DV and micronutrient targets | Published reference values (facts); cited, not copied as documents | Cited in the app's nutrient info screens. |

## User-owned data

- **Hevy**: the user's own workout history, read through Hevy's official public
  API with the user's own API key (Hevy PRO). The key is stored only on the device.
- **Apple Health**: body weight and step count, read on-device with the user's permission.

## Trademarks

Hevy, Apple, Apple Health, HealthKit, iPhone and other product names are
trademarks of their respective owners. They are used only to describe
compatibility. Fuel is an independent personal project and is not affiliated
with, sponsored by, or endorsed by any of them.
