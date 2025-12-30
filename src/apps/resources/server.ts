import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";
import v1Router from "./routes/v1";
import resourcesRouter from "./routes/resources";
import healthRouter from "./routes/health";

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());

// Swagger/OpenAPI setup for multiple versions
const swaggerSpecV1 = swaggerJSDoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Resource Server API",
      version: "1.0.0",
      description: "v1 API",
    },
    servers: [
      { url: `http://localhost:${port}/v1` },
      { url: `http://localhost:${port}` },
    ],
  },
  apis: ["./server.{ts,js}", "./routes/*.{ts,js}"],
});

// Default docs point to latest (v1). Also expose explicit /docs/v1
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpecV1));
app.use("/docs/v1", swaggerUi.serveFiles(swaggerSpecV1), swaggerUi.setup(swaggerSpecV1));

// Mount versioned API
app.use("/v1", v1Router);
// Also expose unversioned convenience routes mapping to latest (v1)
app.use(healthRouter);
app.use("/api/resources", resourcesRouter);

app.listen(port, () => {
  console.log(`Resource server listening on http://localhost:${port}`);
  console.log(`Swagger docs available at http://localhost:${port}/docs`);
});