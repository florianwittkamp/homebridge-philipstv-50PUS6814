# Homebridge-Plugin: homebridge-philipstv-50PUS6814
Homebridge module for Philips TV 50PUS6814/12 with Power on/off, Sound on/off and Ambilight on/off

# Description

This plugin is based on a fork of [homebridge-philipstv-enhanced](https://github.com/jebabin/homebridge-philipstv-enhanced).
The plugin is modified to work on 50PUS6814/12.

# Installation

1. Install homebridge using: npm install -g homebridge
2. Install this plugin using: npm install -g https://github.com/florianwittkamp/homebridge-philipstv-50PUS6814.git
3. Update your configuration file. See the sample below.

# Configuration

Example accessory config (needs to be added to the homebridge config.json):
  ```
 "accessories": [
 	{
 		"accessory": "PhilipsTV",
 		"name": "TV",
 		"ip_address": "192.168.1.200",
 		"poll_status_interval": "60",
 	}
 ]
  ```
