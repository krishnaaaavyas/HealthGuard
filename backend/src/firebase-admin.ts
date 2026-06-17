import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let isConfigured = false;
let db: any = null;

const serviceAccountPath = path.resolve(__dirname, "../service-account.json");
const hasServiceAccount = fs.existsSync(serviceAccountPath);
const hasServiceAccountEnv = !!process.env.FIREBASE_SERVICE_ACCOUNT;
const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const hasGac = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;

const canRunRealFirebase = hasServiceAccount || hasServiceAccountEnv || hasEmulator || hasGac;

try {
  if (canRunRealFirebase) {
    if (hasServiceAccount) {
      const raw = fs.readFileSync(serviceAccountPath, "utf8");
      const serviceAccount = JSON.parse(raw);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("Firebase Admin initialized via service-account.json");
    } else if (hasServiceAccountEnv) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("Firebase Admin initialized via FIREBASE_SERVICE_ACCOUNT env var");
    } else {
      admin.initializeApp();
      console.log("Firebase Admin initialized via default credentials or emulator");
    }
    db = admin.firestore();
    isConfigured = true;
  } else {
    console.warn(
      "No Firebase credentials or emulator found. Falling back to local mock storage mode.",
    );
    isConfigured = false;
  }
} catch (err) {
  console.warn(
    "Firebase Admin failed to initialize. Falling back to local mock storage mode.",
    err,
  );
  isConfigured = false;
}

// Local Mock Storage for testing if Firebase Admin is unconfigured
class MockFirestore {
  private store: Record<string, any> = {};

  collection(collName: string) {
    const self = this;

    const buildDocRef = (docId: string) => {
      const key = `${collName}/${docId}`;
      return {
        id: docId,
        get: async () => ({
          exists: Object.prototype.hasOwnProperty.call(self.store, key),
          data: () => self.store[key],
        }),
        set: async (data: any, options?: any) => {
          if (options?.merge && self.store[key]) {
            self.store[key] = { ...self.store[key], ...data };
          } else {
            self.store[key] = data;
          }
        },
        update: async (data: any) => {
          self.store[key] = { ...(self.store[key] || {}), ...data };
        },
        delete: async () => {
          delete self.store[key];
        },
      };
    };

    const buildQuery = (
      filters: Array<{ field: string; op: string; value: any }>,
      orderField?: string,
      orderDir?: string,
      limitCount?: number,
    ) => {
      const executeQuery = async () => {
        const prefix = `${collName}/`;
        let docs = Object.entries(self.store)
          .filter(([k]) => k.startsWith(prefix))
          .map(([k, v]) => ({ _id: k.slice(prefix.length), _data: v }));

        // Apply where filters
        for (const { field, op, value } of filters) {
          docs = docs.filter((doc) => {
            const v = (doc._data ?? {})[field];
            if (op === "==" || op === "===") return v === value;
            if (op === "!=" || op === "!==") return v !== value;
            if (op === ">") return v > value;
            if (op === ">=") return v >= value;
            if (op === "<") return v < value;
            if (op === "<=") return v <= value;
            return true;
          });
        }

        // Apply ordering
        if (orderField) {
          docs.sort((a, b) => {
            const av = (a._data ?? {})[orderField];
            const bv = (b._data ?? {})[orderField];
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return orderDir === "desc" ? -cmp : cmp;
          });
        }

        // Apply limit
        if (limitCount != null) {
          docs = docs.slice(0, limitCount);
        }

        const resultDocs = docs.map((d) => ({
          id: d._id,
          data: () => d._data,
        }));

        return {
          empty: resultDocs.length === 0,
          size: resultDocs.length,
          docs: resultDocs,
        };
      };

      return {
        where: (field: string, op: string, value: any) =>
          buildQuery([...filters, { field, op, value }], orderField, orderDir, limitCount),
        orderBy: (field: string, dir?: string) =>
          buildQuery(filters, field, dir || "asc", limitCount),
        limit: (n: number) => buildQuery(filters, orderField, orderDir, n),
        get: executeQuery,
      };
    };

    return {
      doc: (id?: string) =>
        buildDocRef(id ?? `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      where: (field: string, op: string, value: any) => buildQuery([{ field, op, value }]),
      orderBy: (field: string, dir?: string) => buildQuery([], field, dir || "asc"),
      limit: (n: number) => buildQuery([], undefined, undefined, n),
      get: () => buildQuery([]).get(),
      add: async (data: any) => {
        const id = `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const key = `${collName}/${id}`;
        self.store[key] = data;
        return buildDocRef(id);
      },
    };
  }
}

if (!isConfigured || !db) {
  db = new MockFirestore();
}

export { admin, db, isConfigured };
