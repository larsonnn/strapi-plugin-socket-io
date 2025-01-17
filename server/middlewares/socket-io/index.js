"use strict";
const fs = require('fs');
const path = require('path');
const { sanitizeEntity } = require("strapi-utils");

const loadSettings = (appPath) => {
	const routesPath = path.join(appPath, 'extensions', 'socket-io', 'services', 'config.json');
	if(fs.existsSync(routesPath)) {
		return require(routesPath);
	}
	return null;
}

module.exports = (strapi) => {
  return {
    beforeInitialize() {
      strapi.config.middleware.load.after.unshift("socket");
    },
    initialize() {
      const settings  = loadSettings(strapi.config.appPath);
      let settingsRoutes = settings ? settings.routes : null;
      if(!Array.isArray(settingsRoutes)) settingsRoutes = null;
      const { actions } = strapi.plugins['socket-io'].services['socket-io'];
      strapi.app.use(async (ctx, next) => {
        await next();

        let route = ctx.request.route;
        if(route === undefined) return;
        if(!actions().includes(route.action)) return;

        if(route.action === "bulkdelete") {
          ctx.response.body = ctx.response.body.filter(body => body.published_at !== null);
          if(ctx.response.body.length === 0) return;
        } else {
          if(!ctx.response.body.published_at && route.action !== "unpublish") {
            return;
          }
        }

        if(route.action === "publish") route.action = "create";
        if(route.action === "unpublish") route.action = "delete"

        try {
          if (!route.plugin) {
            if (
              route.controller in strapi.controllers &&
              actions().includes(route.action) === true
            ) {
              if(settingsRoutes) {
                const isValidRoute = settingsRoutes.filter(sr => {
                  return sr.apiName === route.controller;
                });
                
                if(isValidRoute.length === 0) return;
              }
              
                strapi.StrapIO.emit(
                  strapi.controllers[route.controller],
                  route.action,
                  ctx.response.body
                );
            }
          } else if (route.controller === "collection-types") {
            let model = strapi.getModel(ctx.params.model);
            let action;
            let data;
            if(settingsRoutes) {
              const isValidRoute = settingsRoutes.filter(sr => {
                return sr.apiName === model.apiName;
              });
              if(isValidRoute.length === 0) return;
            }

            if (route.action === "bulkdelete") {
              action = "delete";
              let rawData = Object.values(ctx.response.body);
              data = rawData.map((entity) =>
                sanitizeEntity(entity, { model: strapi.models[model.apiName] })
              );
            } else {
              action = route.action;
              data = await sanitizeEntity(ctx.response.body, {
                model: strapi.models[model.apiName],
              });
            }

            if (
              model.apiName in strapi.controllers &&
              actions().includes(route.action) === true
            ) {
          
              strapi.StrapIO.emit(
                strapi.controllers[model.apiName],
                action,
                data
              );
            }
          }
        } catch (err) {
          console.log(err);
        }
      });
    },
  };
};
