import axios from "axios";
import { config } from "../config.js";

export const egovphClient = axios.create({ baseURL: config.egovph.baseUrl });
export const everifyClient = axios.create({ baseURL: config.everify.baseUrl });
export const emessageClient = axios.create({ baseURL: config.emessage.baseUrl });
export const egovpayClient = axios.create({ baseURL: config.egovpay.baseUrl });
export const ereportClient = axios.create({ baseURL: config.ereport.baseUrl });
export const faceLivenessClient = axios.create({ baseURL: config.faceLiveness.baseUrl });

/**
 * PSGC Cloud (https://psgc.cloud) — a free, public, unauthenticated REST API for the
 * Philippine Standard Geographic Code (regions/provinces/cities-municipalities/
 * barangays). Not part of the eGOV APIs suite; used for the registration "Location"
 * picker. Verified live (2026-07-28): GET /regions, /regions/{code}/provinces,
 * /provinces/{code}/cities-municipalities, /cities-municipalities/{code}/barangays all
 * return plain JSON arrays of { name, code }, no auth header needed. See routes/locations.ts.
 */
export const psgcClient = axios.create({ baseURL: "https://psgc.cloud/api" });
