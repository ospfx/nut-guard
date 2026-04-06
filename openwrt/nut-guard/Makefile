# Nut Guard — OpenWrt/ImmortalWrt Package Makefile
#
# Drop the openwrt/nut-guard/ directory into your OpenWrt package feed
# (e.g. package/nut-guard/) and run:
#   make package/nut-guard/compile
#
# Depends on the 'node' package (Node.js runtime).

include $(TOPDIR)/rules.mk

PKG_NAME:=nut-guard
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

PKG_MAINTAINER:=ospfx <https://github.com/ospfx>
PKG_LICENSE:=AGPL-3.0-or-later
PKG_LICENSE_FILES:=LICENSE

include $(INCLUDE_DIR)/package.mk

define Package/nut-guard
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Nut Guard UPS Monitor Daemon
  DEPENDS:=+node
  URL:=https://github.com/ospfx/nut-guard
  PKGARCH:=all
endef

define Package/nut-guard/description
  UPS monitoring daemon for Network UPS Tools (NUT) protocol.
  Reads configuration from UCI (/etc/config/nut-guard), queries the
  NUT server periodically, and writes status data to
  /tmp/nut-guard/status.json for the LuCI interface.
  Managed by procd; no additional web port is opened.
endef

define Package/nut-guard/conffiles
/etc/config/nut-guard
endef

define Build/Prepare
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/nut-guard/install
	$(INSTALL_DIR) $(1)/usr/share/nut-guard
	$(INSTALL_DATA) ./files/usr/share/nut-guard/daemon.js $(1)/usr/share/nut-guard/daemon.js
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/nut-guard $(1)/etc/init.d/nut-guard
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/nut-guard $(1)/etc/config/nut-guard
endef

$(eval $(call BuildPackage,nut-guard))
