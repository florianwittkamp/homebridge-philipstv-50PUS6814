var Service;
var Characteristic;
var request = require("request");
var pollingtoevent = require('polling-to-event');

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-philipstv-50PUS6814", "PhilipsTV", HttpStatusAccessory);
}

function HttpStatusAccessory(log, config) {
  this.log = log;
  var that = this;

  this.log("Staring homebridge-philipstv-50PUS6814");

  // CONFIG
  this.ip_address = config["ip_address"];
  this.name = config["name"];
  this.poll_status_interval = config["poll_status_interval"] || "0";
  this.set_attempt = 0;
  this.api_version = 6;

  // CONNECTION SETTINGS
  this.protocol = "http";
  this.portno = "1925";

  // INITIAL VALUES
  this.state_power = true;
  this.state_ambilight = false;
  this.state_volume = false;

  // Define URL & JSON Payload for Actions

  // POWER
  this.power_url = this.protocol + "://" + this.ip_address + ":" + this.portno + "/" + this.api_version + "/powerstate";
  this.power_on_body = JSON.stringify({
    "powerstate": "On"
  });
  this.power_off_body = JSON.stringify({
    "powerstate": "Standby"
  });

  // Volume
  this.audio_url = this.protocol + "://" + this.ip_address + ":" + this.portno + "/" + this.api_version + "/audio/volume";
  this.audio_unmute_body = JSON.stringify({
    "muted": false
  });
  this.audio_mute_body = JSON.stringify({
    "muted": true
  });

  // AMBILIGHT
  this.ambilight_status_url = this.protocol + "://" + this.ip_address + ":" + this.portno + "/" + this.api_version + "/menuitems/settings/current";
  this.ambilight_mode_body = JSON.stringify({
    "nodes": [{
      "nodeid": 100
    }]
  });

  this.ambilight_config_url = this.protocol + "://" + this.ip_address + ":" + this.portno + "/" + this.api_version + "/menuitems/settings/update";
  this.ambilight_power_on_body = JSON.stringify({
    "value": {
      "Nodeid": 100,
      "Controllable": true,
      "Available": true,
      "data": {
        "activenode_id": 120
      }
    }
  }); // Follow Video
  this.ambilight_power_off_body = JSON.stringify({
    "value": {
      "Nodeid": 100,
      "Controllable": true,
      "Available": true,
      "data": {
        "activenode_id": 110
      }
    }
  });

  // POLLING ENABLED?
  this.interval = parseInt(this.poll_status_interval);
  this.switchHandling = "check";
  if (this.interval > 10 && this.interval < 100000) {
    this.switchHandling = "poll";
  }

  // STATUS POLLING
  if (this.switchHandling == "poll") {
    var statusemitter = pollingtoevent(function(done) {
      that.getPowerState(function(error, response) {
        done(error, response, that.set_attempt);
      }, "statuspoll");
    }, {
      longpolling: true,
      interval: that.interval * 1000,
      longpollEventName: "statuspoll_power"
    });

    statusemitter.on("statuspoll_power", function(data) {
      that.state_power = data;
      if (that.switchService) {
        that.switchService.getCharacteristic(Characteristic.On).setValue(that.state_power, null, "statuspoll");
      }
    });

    var statusemitter_volume = pollingtoevent(function(done) {
      that.getVolumeState(function(error, response) {
        done(error, response, that.set_attempt);
      }, "statuspoll");
    }, {
      longpolling: true,
      interval: that.interval * 1000,
      longpollEventName: "statuspoll_volume"
    });

    statusemitter.on("statuspoll_volume", function(data) {
      that.state_volume = data;
      if (that.VolumeService) {
        that.VolumeService.getCharacteristic(Characteristic.On).setValue(that.state_volume, null, "statuspoll");
      }
    });


    var statusemitter_ambilight = pollingtoevent(function(done) {
      that.getAmbilightState(function(error, response) {
        done(error, response, that.set_attempt);
      }, "statuspoll");
    }, {
      longpolling: true,
      interval: that.interval * 1000,
      longpollEventName: "statuspoll_ambilight"
    });

    statusemitter_ambilight.on("statuspoll_ambilight", function(data) {
      that.state_ambilight = data;
      if (that.ambilightService) {
        that.ambilightService.getCharacteristic(Characteristic.On).setValue(that.state_ambilight, null, "statuspoll");
      }
    });

  }
}

/////////////////////////////

HttpStatusAccessory.prototype = {

  // Sometime the API fail, all calls should use a retry method, not used yet but goal is to replace all the XLoop function by this generic one
  httpRequest_with_retry: function(url, body, method, retry_count, callback) {
    this.httpRequest(url, body, method, function(error, response, responseBody) {
      if (error) {
        if (retry_count > 0) {
          this.log('Got error, will retry: ', retry_count, ' time(s)');
          this.httpRequest_with_retry(url, body, method, retry_count - 1, function(err) {
            callback(err);
          });
        } else {
          this.log('Request failed: %s', error.message);
          callback(new Error("Request attempt failed"));
        }
      } else {
        this.log('succeeded - answer: %s', responseBody);
        callback(null, response, responseBody);
      }
    }.bind(this));
  },

  httpRequest: function(url, body, method, callback) {
    var options = {
      url: url,
      body: body,
      method: method,
      rejectUnauthorized: false,
      timeout: 1000
    };

    req = request(options,
      function(error, response, body) {
        callback(error, response, body)
      }
    );
  },

  // POWER FUNCTIONS
  setPowerStateLoop: function(nCount, url, body, powerState, callback) {
    var that = this;

    that.httpRequest(url, body, "POST", function(error, response, responseBody) {
      if (error) {
        if (nCount > 0) {
          that.log('setPowerStateLoop - powerstate attempt, attempt id: ', nCount - 1);
          that.setPowerStateLoop(nCount - 1, url, body, powerState, function(err, state_power) {
            callback(err, state_power);
          });
        } else {
          that.log('setPowerStateLoop - failed: %s', error.message);
          powerState = false;
          callback(new Error("HTTP attempt failed"), powerState);
        }
      } else {
        that.log('setPowerStateLoop - Succeeded - current state: %s', powerState);
        callback(null, powerState);
      }
    });
  },

  setPowerState: function(powerState, callback, context) {
    var url = this.power_url;
    var body;
    var that = this;

    this.log.debug("Entering %s with context: %s and target value: %s", arguments.callee.name, context, powerState);

    if (context && context == "statuspoll") {
      callback(null, powerState);
      return;
    }

    this.set_attempt = this.set_attempt + 1;

    if (powerState) {
      body = this.power_on_body;
      this.log("setPowerState - Cannot power on over wifi");
    } else {
      body = this.power_off_body;
      this.log("setPowerState - Will power off");
      that.setPowerStateLoop(0, url, body, powerState, function(error, state_power) {
        that.state_power = state_power;
        if (error) {
          that.state_power = false;
          that.log("setPowerStateLoop - ERROR: %s", error);
        }
        if (that.switchService) {
          that.switchService.getCharacteristic(Characteristic.On).setValue(that.state_power, null, "statuspoll");
        }
        if (that.ambilightService) {
          that.state_ambilight = false;
          that.ambilightService.getCharacteristic(Characteristic.On).setValue(that.state_ambilight, null, "statuspoll");
        }
        if (that.volumeService) {
          that.state_volume = false;
          that.volumeService.getCharacteristic(Characteristic.On).setValue(that.state_volume, null, "statuspoll");
        }
        callback(error, that.state_power);
      }.bind(this));
    }
  },

  getPowerState: function(callback, context) {
    var that = this;
    var url = this.power_url;


    this.log.debug("Entering %s with context: %s and current value: %s", arguments.callee.name, context, this.state_power);
    //if context is statuspoll, then we need to request the actual value else we return the cached value
    if ((!context || context != "statuspoll") && this.switchHandling == "poll") {
      callback(null, this.state_power);
      return;
    }

    this.httpRequest(url, "", "GET", function(error, response, responseBody) {
      var tResp = that.state_power;
      var fctname = "getPowerState";
      if (error) {
        that.log('%s - ERROR: %s', fctname, error.message);
        that.state_power = false;
      } else {
        if (responseBody) {
          var responseBodyParsed;
          try {
            responseBodyParsed = JSON.parse(responseBody);
            if (responseBodyParsed && responseBodyParsed.powerstate) {
              tResp = (responseBodyParsed.powerstate == "On") ? 1 : 0;
            } else {
              that.log("%s - Could not parse message: '%s', not updating state", fctname, responseBody);
            }
          } catch (e) {
            that.log("%s - Got non JSON answer - not updating state: '%s'", fctname, responseBody);
          }
        }
        if (that.state_power != tResp) {
          that.log('%s - Level changed to: %s', fctname, tResp);
          that.state_power = tResp;
        }
      }
      callback(null, that.state_power);
    }.bind(this));
  },

  // AMBILIGHT FUNCTIONS
  setAmbilightStateLoop: function(nCount, url, body, ambilightState, callback) {
    var that = this;

    that.httpRequest(url, body, "POST", function(error, response, responseBody) {
      if (error) {
        if (nCount > 0) {
          that.log('setAmbilightStateLoop - attempt, attempt id: ', nCount - 1);
          that.setAmbilightStateLoop(nCount - 1, url, body, ambilightState, function(err, state) {
            callback(err, state);
          });
        } else {
          that.log('setAmbilightStateLoop - failed: %s', error.message);
          ambilightState = false;
          callback(new Error("HTTP attempt failed"), ambilightState);
        }
      } else {
        that.log('setAmbilightStateLoop - succeeded - current state: %s', ambilightState);
        callback(null, ambilightState);
      }
    });
  },

  setAmbilightState: function(ambilightState, callback, context) {
    this.log.debug("Entering setAmbilightState with context: %s and requested value: %s", context, ambilightState);
    var url;
    var body;
    var that = this;

    //if context is statuspoll, then we need to ensure that we do not set the actual value
    if (context && context == "statuspoll") {
      callback(null, ambilightState);
      return;
    }

    this.set_attempt = this.set_attempt + 1;

    if (ambilightState) {
      url = this.ambilight_config_url;
      body = this.ambilight_power_on_body;
      this.log("setAmbilightState - setting state to on");
    } else {
      url = this.ambilight_config_url;
      body = this.ambilight_power_off_body;
      this.log("setAmbilightState - setting state to off");
    }

    that.setAmbilightStateLoop(0, url, body, ambilightState, function(error, state) {
      that.state_ambilight = ambilightState;
      if (error) {
        that.state_ambilight = false;
        that.log("setAmbilightState - ERROR: %s", error);
        if (that.ambilightService) {
          that.ambilightService.getCharacteristic(Characteristic.On).setValue(that.state_ambilight, null, "statuspoll");
        }
      }
      callback(error, that.state_ambilight);
    }.bind(this));
  },

  getAmbilightState: function(callback, context) {
    var that = this;
    var url = this.ambilight_status_url;
    var body = this.ambilight_mode_body;

    this.log.debug("Entering %s with context: %s and current value: %s", arguments.callee.name, context, this.state_ambilight);
    //if context is statuspoll, then we need to request the actual value
    if ((!context || context != "statuspoll") && this.switchHandling == "poll") {
      callback(null, this.state_ambilight);
      return;
    }
    if (!this.state_power) {
      callback(null, false);
      return;
    }

    this.httpRequest(url, body, "POST", function(error, response, responseBody) {
      var tResp = that.state_ambilight;
      var fctname = "getAmbilightState";
      if (error) {
        that.log('%s - ERROR: %s', fctname, error.message);
      } else {
        if (responseBody) {
          var responseBodyParsed;
          try {
            responseBodyParsed = JSON.parse(responseBody);
            if (responseBodyParsed && responseBodyParsed.values[0].value.data.activenode_id) {
              tResp = (responseBodyParsed.values[0].value.data.activenode_id == 110) ? false : true;
              that.log.debug('%s - got answer %s', fctname, tResp);
            } else {
              that.log("%s - Could not parse message: '%s', not updating state", fctname, responseBody);
            }
          } catch (e) {
            that.log("%s - Got non JSON answer - not updating state: '%s'", fctname, responseBody);
          }
        }
        if (that.state_ambilight != tResp) {
          that.log('%s - state changed to: %s', fctname, tResp);
          that.state_ambilight = tResp;
        }
      }
      callback(null, that.state_ambilight);
    }.bind(this));
  },

  // Volume

  setVolumeStateLoop: function(nCount, url, body, volumeState, callback) {
    var that = this;

    that.httpRequest(url, body, "POST", function(error, response, responseBody) {
      if (error) {
        if (nCount > 0) {
          that.log('setVolumeStateLoop - attempt, attempt id: ', nCount - 1);
          that.setVolumeStateLoop(nCount - 1, url, body, volumeState, function(err, state) {
            callback(err, state);
          });
        } else {
          that.log('setVolumeStateLoop - failed: %s', error.message);
          volumeState = false;
          callback(new Error("HTTP attempt failed"), volumeState);
        }
      } else {
        that.log('setVolumeStateLoop - succeeded - current state: %s', volumeState);
        callback(null, volumeState);
      }
    });
  },

  setVolumeState: function(volumeState, callback, context) {
    var url = this.audio_url;
    var body;
    var that = this;

    this.log.debug("Entering %s with context: %s and target value: %s", arguments.callee.name, context, volumeState);

    //if context is statuspoll, then we need to ensure that we do not set the actual value
    if (context && context == "statuspoll") {
      callback(null, volumeState);
      return;
    }

    this.set_attempt = this.set_attempt + 1;

    if (volumeState) {
      body = this.audio_unmute_body;
      this.log("setVolumeState - setting state to on");
    } else {
      body = this.audio_mute_body;
      this.log("setVolumeState - setting state to off");
    }

    that.setVolumeStateLoop(0, url, body, volumeState, function(error, state) {
      that.state_volume = volumeState;
      if (error) {
        that.state_volume = false;
        that.log("setVolumeState - ERROR: %s", error);
        if (that.volumeService) {
          that.volumeService.getCharacteristic(Characteristic.On).setValue(that.state_volume, null, "statuspoll");
        }
      }
      callback(error, that.state_volume);

    }.bind(this));
  },

  getVolumeState: function(callback, context) {
    var that = this;
    var url = this.audio_url;

    this.log.debug("Entering %s with context: %s and current state: %s", arguments.callee.name, context, this.state_volume);

    //if context is statuspoll, then we need to request the actual value
    if ((!context || context != "statuspoll") && this.switchHandling == "poll") {
      callback(null, this.state_volume);
      return;
    }
    if (!this.state_power) {
      callback(null, false);
      return;
    }

    this.httpRequest(url, "", "GET", function(error, response, responseBody) {
      var tResp = that.state_volume;
      var fctname = "getVolumeState";
      if (error) {
        that.log('%s - ERROR: %s', fctname, error.message);
      } else {
        if (responseBody) {
          var responseBodyParsed;
          try {
            responseBodyParsed = JSON.parse(responseBody);
            if (responseBodyParsed) {
              tResp = (responseBodyParsed.muted == "true") ? 0 : 1;
              that.log.debug('%s - got answer %s', fctname, tResp);
            } else {
              that.log("%s - Could not parse message: '%s', not updating state", fctname, responseBody);
            }
          } catch (e) {
            that.log("%s - Got non JSON answer - not updating state: '%s'", fctname, responseBody);
          }
        }
        if (that.state_volume != tResp) {
          that.log('%s - state changed to: %s', fctname, tResp);
          that.state_volume = tResp;
        }
      }
      callback(null, tResp);
    }.bind(this));
  },

  identify: function(callback) {
    this.log("Identify TV requested!");
    callback(); // success
  },

  getServices: function() {
    var that = this;

    var informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Philips')
      .setCharacteristic(Characteristic.Model, "50PUS6814/12");

    // POWER
    this.switchService = new Service.Switch(this.name + " Power", '0a');
    this.switchService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));

    // VOLUME
    this.volumeService = new Service.Switch(this.name + " Volume", '0b');
    this.volumeService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getVolumeState.bind(this))
      .on('set', this.setVolumeState.bind(this));

    // AMBILIGHT
    this.ambilightService = new Service.Switch(this.name + " Ambilight", '0c');
    this.ambilightService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getAmbilightState.bind(this))
      .on('set', this.setAmbilightState.bind(this));

    return [informationService, this.switchService, this.volumeService, this.ambilightService];

  }
};
