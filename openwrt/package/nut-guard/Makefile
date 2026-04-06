include $(TOPDIR)/rules.mk

PKG_NAME:=nut-guard
PKG_VERSION:=0.2.0
PKG_RELEASE:=1

PKG_MAINTAINER:=ospfx
PKG_LICENSE:=AGPL-3.0-or-later
PKG_LICENSE_FILES:=LICENSE

include $(INCLUDE_DIR)/package.mk

define Package/nut-guard
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Nut Guard – UPS monitor daemon
  DEPENDS:=+node
  URL:=https://github.com/ospfx/nut-guard
  PKGARCH:=all
endef

define Package/nut-guard/description
  Nut Guard monitors a NUT (Network UPS Tools) server via TCP and
  periodically writes the current UPS status to
  /var/run/nut-guard/status.json.

  The daemon is managed by procd and configured via UCI
  (/etc/config/nut-guard).  No extra management port is opened –
  the companion luci-app-nut-guard package provides the web UI
  through the existing LuCI/uhttpd interface.
endef

define Package/nut-guard/conffiles
/etc/config/nut-guard
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
endef

define Build/Compile
endef

define Package/nut-guard/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(CURDIR)/../../../../daemon.js $(1)/usr/bin/nut-guard

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/nut-guard.init $(1)/etc/init.d/nut-guard

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/nut-guard.config $(1)/etc/config/nut-guard
endef

$(eval $(call BuildPackage,nut-guard))
