// @author: YousefED
// From https://github.com/YousefED/cesium/commit/3791582640b12753c7ebd09efe4d7a032fcbfeca


/**
 * A {@link TerrainProvider} that produces terrain geometry by tessellating height maps
 * retrieved from Mapzen (which are publicly hosted on S3).
 *
 * @alias MapzenTerrariumTerrainProvider
 * @constructor
 *
 * @param {Object} options Object with the following properties:
 * @param {String} options.url The base url, e.g.: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/ .
 * @param {Object} [options.proxy] A proxy to use for requests. This object is expected to have a getURL function which returns the proxied URL, if needed.
 * @param {TilingScheme} [options.tilingScheme] The tiling scheme specifying how the terrain
 *                       is broken into tiles.  If this parameter is not provided, a {@link GeographicTilingScheme}
 *                       is used.
 * @param {Ellipsoid} [options.ellipsoid] The ellipsoid.  If the tilingScheme is specified,
 *                    this parameter is ignored and the tiling scheme's ellipsoid is used instead.
 *                    If neither parameter is specified, the WGS84 ellipsoid is used.
 * @param {Credit|String} [options.credit] The credit, which will is displayed on the canvas.
 *
 *
 * @example
 * var terrainProvider = new Cesium.MapzenTerrariumTerrainProvider({
 *   url : 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/',
 * });
 * viewer.terrainProvider = terrainProvider;
 *
 *  @see TerrainProvider
 */
export default function MapzenTerrariumTerrainProvider(options) {
    //>>includeStart('debug', pragmas.debug);
    
    this._token = options.token;
    this._url = options.url;

    var resource = Cesium.Resource.createIfNeeded(options.url);
    this._resource = resource;

    this._tilingScheme = options.tilingScheme;
    if (!Cesium.defined(this._tilingScheme)) {
        /*this._tilingScheme = new GeographicTilingScheme({
            ellipsoid : defaultValue(options.ellipsoid, Ellipsoid.WGS84)
        });*/ 
        this._tilingScheme = new Cesium.WebMercatorTilingScheme({
            numberOfLevelZeroTilesX:1,
            numberOfLevelZeroTilesY:1,
            ellipsoid : Cesium.defaultValue(options.ellipsoid, Cesium.Ellipsoid.WGS84)
        });
    }

    this._heightmapWidth = 64;
    this._levelZeroMaximumGeometricError = Cesium.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(this._tilingScheme.ellipsoid, this._heightmapWidth, this._tilingScheme.getNumberOfXTilesAtLevel(0));

    this._proxy = options.proxy;

    this._terrainDataStructure = {
        heightScale : 1.0 / 256.0,
        heightOffset : -32768.0,
        elementsPerHeight : 3,
        stride : 4,
        elementMultiplier : 256.0,
        isBigEndian : true,
        lowestEncodedHeight : 0,
        highestEncodedHeight : 256 * 256 * 256 - 1
    };

    this._errorEvent = new Cesium.Event();

    var credit = options.credit;
    if (typeof credit === 'string') {
        credit = new Cesium.Credit(credit);
    }
    this._credit = credit;
    this._readyPromise = Promise.resolve(true);

    this._terrainPromises = {};
}

Object.defineProperties(MapzenTerrariumTerrainProvider.prototype, {
    /**
     * Gets an event that is raised when the terrain provider encounters an asynchronous error.  By subscribing
     * to the event, you will be notified of the error and can potentially recover from it.  Event listeners
     * are passed an instance of {@link TileProviderError}.
     * @memberof MapzenTerrariumTerrainProvider.prototype
     * @type {Event}
     */
    errorEvent : {
        get : function() {
            return this._errorEvent;
        }
    },

    /**
     * Gets the credit to display when this terrain provider is active.  Typically this is used to credit
     * the source of the terrain.  This function should not be called before {@link MapzenTerrariumTerrainProvider#ready} returns true.
     * @memberof MapzenTerrariumTerrainProvider.prototype
     * @type {Credit}
     */
    credit : {
        get : function() {
            return this._credit;
        }
    },

    /**
     * Gets the tiling scheme used by this provider.  This function should
     * not be called before {@link MapzenTerrariumTerrainProvider#ready} returns true.
     * @memberof MapzenTerrariumTerrainProvider.prototype
     * @type {GeographicTilingScheme}
     */
    tilingScheme : {
        get : function() {
            return this._tilingScheme;
        }
    },

    /**
     * Gets a value indicating whether or not the provider is ready for use.
     * @memberof MapzenTerrariumTerrainProvider.prototype
     * @type {Boolean}
     */
    ready : {
        get : function() {
            return true;
        }
    },

    /**
     * Gets a promise that resolves to true when the provider is ready for use.
     * @memberof MapzenTerrariumTerrainProvider.prototype
     * @type {Promise.<Boolean>}
     * @readonly
     */
    readyPromise : {
        get : function() {
            return this._readyPromise;
        }
    },

    /**
     * Gets a value indicating whether or not the provider includes a water mask.  The water mask
     * indicates which areas of the globe are water rather than land, so they can be rendered
     * as a reflective surface with animated waves.  This function should not be
     * called before {@link MapzenTerrariumTerrainProvider#ready} returns true.
     * @memberof MapzenTerrariumTerrainProvider.prototype
     * @type {Boolean}
     */
    hasWaterMask : {
        get : function() {
            return false;
        }
    },

    /**
     * Gets a value indicating whether or not the requested tiles include vertex normals.
     * This function should not be called before {@link MapzenTerrariumTerrainProvider#ready} returns true.
     * @memberof MapzenTerrariumTerrainProvider.prototype
     * @type {Boolean}
     */
    hasVertexNormals : {
        get : function() {
            return false;
        }
    }
});

/**
 * Requests the geometry for a given tile.  This function should not be called before
 * {@link MapzenTerrariumTerrainProvider#ready} returns true.  The result includes terrain
 * data and indicates that all child tiles are available.
 *
 * @param {Number} x The X coordinate of the tile for which to request geometry.
 * @param {Number} y The Y coordinate of the tile for which to request geometry.
 * @param {Number} level The level of the tile for which to request geometry.
 * @returns {Promise.<TerrainData>|undefined} A promise for the requested geometry.  If this method
 *          returns undefined instead of a promise, it is an indication that too many requests are already
 *          pending and the request will be retried later.
 */
MapzenTerrariumTerrainProvider.prototype.requestTileGeometry = function(x, y, level, request) {
    var url = this._url+level+'/'+x+'/'+y+'.png';

    var proxy = this._proxy;
    if (Cesium.defined(proxy)) {
        url = proxy.getURL(url);
    }

    // var promise = this._terrainPromises[url];

    // if (!promise) {
    //     promise = this.loadImage(url, true, request);
    //     this._terrainPromises[url] = promise;
    // }

    var resource = this._resource.getDerivedResource({
        url : url,
        queryParameters : {
            cesium : true
        },
        request : request
    });
    var promise = resource.fetchImage({
        preferImageBitmap: true
    });
    if (!Cesium.defined(promise)) {
        return undefined;
    }

    var that = this;
    return promise.then(function(image) {
        return new Cesium.HeightmapTerrainData({
            buffer : Cesium.getImagePixels(image, that._heightmapWidth, that._heightmapWidth),
            width : that._heightmapWidth,
            height : that._heightmapWidth,
            childTileMask : level < 16 ? 0 : 15,
            structure : that._terrainDataStructure
        });
    });
};

/**
 * Gets the maximum geometric error allowed in a tile at a given level.
 *
 * @param {Number} level The tile level for which to get the maximum geometric error.
 * @returns {Number} The maximum geometric error.
 */
MapzenTerrariumTerrainProvider.prototype.getLevelMaximumGeometricError = function(level) {
    return this._levelZeroMaximumGeometricError / (1 << level);
};

/**
 * Determines whether data for a tile is available to be loaded.
 *
 * @param {Number} x The X coordinate of the tile for which to request geometry.
 * @param {Number} y The Y coordinate of the tile for which to request geometry.
 * @param {Number} level The level of the tile for which to request geometry.
 * @returns {Boolean} Undefined if not supported, otherwise true or false.
 */
MapzenTerrariumTerrainProvider.prototype.getTileDataAvailable = function(x, y, level) {
    return level < 16 ? true : undefined;
};
