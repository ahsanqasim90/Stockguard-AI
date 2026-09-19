import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const MODEL_URL = new URL("../../models/production/v1.0.0/stockguard_xgboost.json", import.meta.url);
const MAPPINGS_URL = new URL("../../models/production/v1.0.0/category_mappings.json", import.meta.url);
const MANIFEST_URL = new URL("../../models/production/v1.0.0/training_manifest.json", import.meta.url);

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

const manifest = readJson(MANIFEST_URL);
const mappings = readJson(MAPPINGS_URL);
const modelBuffer = readFileSync(MODEL_URL);
const modelHash = crypto.createHash("sha256").update(modelBuffer).digest("hex");

if (modelHash !== manifest.model_sha256) {
  throw new Error("StockGuard production model checksum verification failed.");
}

const serializedModel = JSON.parse(modelBuffer.toString("utf8"));
const learner = serializedModel.learner;
const booster = learner.gradient_booster;
const trees = booster.model.trees;
const featureNames = learner.feature_names;
const featureTypes = learner.feature_types;
const baseScores = JSON.parse(learner.learner_model_param.base_score);

if (booster.name !== "gbtree" || learner.objective.name !== "reg:squarederror") {
  throw new Error("The bundled model uses an unsupported XGBoost booster or objective.");
}
if (featureNames.join("|") !== manifest.feature_columns.join("|")) {
  throw new Error("The bundled model features do not match its training manifest.");
}
if (baseScores.length !== 1) {
  throw new Error("Only a single-output XGBoost model is supported.");
}

const preparedTrees = trees.map((tree) => {
  const categoryRanges = new Map();
  tree.categories_nodes.forEach((node, index) => {
    categoryRanges.set(node, {
      begin: tree.categories_segments[index],
      size: tree.categories_sizes[index],
    });
  });
  return { ...tree, categoryRanges };
});

function includesSorted(values, begin, size, target) {
  let low = begin;
  let high = begin + size - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const value = values[middle];
    if (value === target) return true;
    if (value < target) low = middle + 1;
    else high = middle - 1;
  }
  return false;
}

function predictTree(tree, features) {
  let node = 0;
  while (tree.left_children[node] !== -1) {
    const featureIndex = tree.split_indices[node];
    const value = features[featureIndex];
    if (!Number.isFinite(value)) {
      node = tree.default_left[node] ? tree.left_children[node] : tree.right_children[node];
      continue;
    }
    if (tree.split_type[node] === 1) {
      const range = tree.categoryRanges.get(node);
      const categoryMatches = range
        ? includesSorted(tree.categories, range.begin, range.size, value)
        : false;
      node = categoryMatches ? tree.right_children[node] : tree.left_children[node];
    } else {
      node = value < Math.fround(tree.split_conditions[node]) ? tree.left_children[node] : tree.right_children[node];
    }
  }
  const leafValue = Math.fround(tree.split_conditions[node]);
  return leafValue;
}

export function predictXGBoost(features) {
  if (!Array.isArray(features) || features.length !== featureNames.length) {
    throw new Error(`Expected ${featureNames.length} model features.`);
  }
  let prediction = Math.fround(baseScores[0]);
  for (const tree of preparedTrees) {
    prediction = Math.fround(prediction + Math.fround(predictTree(tree, features)));
  }
  return prediction;
}

export function productionSeriesCodes(storeId, productId) {
  const storeCode = mappings.stores[storeId];
  const productCode = mappings.products[productId];
  if (!Number.isInteger(storeCode) || !Number.isInteger(productCode)) return null;
  return { storeCode, productCode };
}

export function productionModelStatus() {
  return {
    available: true,
    model: manifest.model_type,
    version: manifest.model_version,
    sha256: modelHash,
    xgboostVersion: manifest.xgboost_version,
    features: featureNames.length,
    trees: preparedTrees.length,
    mappedStores: Object.keys(mappings.stores).length,
    mappedProducts: Object.keys(mappings.products).length,
    fallbackModel: manifest.production_policy.fallback_model,
  };
}

export { featureNames, featureTypes, manifest };
